import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { SelfInventoryAdjustDto } from '../dto/self-inventory.dto';
import { ShopContextService } from './shop-context.service';
import { ShopRole } from '@prisma/client';

@Injectable()
export class ShopInventoryService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async getInventory(shopId: number, userId: number, memberId?: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    if (member.role !== ShopRole.CUSTOMER && !memberId) {
      throw new BadRequestException('请指定要查看的顾客');
    }
    const targetId = member.role === ShopRole.CUSTOMER ? member.id : memberId ?? member.id;

    if (member.role !== ShopRole.CUSTOMER && memberId) {
      this.ctx.ensureShopManager(member.role);
      const target = await this.prisma.member.findFirst({ where: { id: memberId, shopId, isActive: true } });
      if (!target) throw new NotFoundException('成员不存在');
      if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有背包');
    }

    const orderBy: Prisma.InventoryOrderByWithRelationInput[] = [
      { sortOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ];
    return this.prisma.inventory.findMany({
      where: { memberId: targetId },
      select: { id: true, name: true, quantity: true },
      orderBy,
    });
  }

  async reorderInventory(shopId: number, userId: number, inventoryIds: number[]) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ctx.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');

    const uniqueIds = Array.from(new Set(inventoryIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
    if (uniqueIds.length !== inventoryIds.length) throw new BadRequestException('物品列表存在重复或非法 id');

    const existing = await this.prisma.inventory.findMany({
      where: { memberId: actor.id },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const existingIds = existing.map((x) => x.id);
    if (existingIds.length === 0) return { ok: true };
    if (uniqueIds.length !== existingIds.length) throw new BadRequestException('物品列表不完整，请刷新后重试');

    const existingSet = new Set(existingIds);
    for (const id of uniqueIds) {
      if (!existingSet.has(id)) throw new BadRequestException('物品不属于你的背包，请刷新后重试');
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < uniqueIds.length; i++) {
        await tx.inventory.update({ where: { id: uniqueIds[i] }, data: { sortOrder: i + 1 } });
      }
      await tx.log.create({
        data: { shopId, memberId: actor.id, actorId: actor.id, type: 'self_inventory_reorder', content: `顾客自助调整背包排序`, amount: 0 },
      });
    });

    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: actor.id });
    return { ok: true };
  }

  async adjustInventory(shopId: number, userId: number, payload: { memberId: number; name: string; quantityDelta: number }) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const target = await this.prisma.member.findFirst({ where: { id: payload.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有背包');

    const inv = await this.prisma.inventory.findUnique({ where: { memberId_name: { memberId: target.id, name: payload.name } } });
    const beforeQty = inv?.quantity ?? 0;
    const nextQty = beforeQty + payload.quantityDelta;
    if (nextQty <= 0) {
      if (inv) {
        await this.prisma.inventory.delete({ where: { id: inv.id } });
      }
    } else if (inv) {
      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: nextQty, icon: null, extraDesc: null },
      });
    } else {
      const maxSort = await this.prisma.inventory.aggregate({
        where: { memberId: target.id },
        _max: { sortOrder: true },
      });
      await this.prisma.inventory.create({
        data: {
          memberId: target.id,
          name: payload.name,
          icon: null,
          extraDesc: null,
          quantity: nextQty,
          sortOrder: (maxSort._max?.sortOrder ?? 0) + 1,
        },
      });
    }

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: target.id,
        actorId: actor.id,
        type: 'inventory_adjust',
        content: `背包 ${payload.name} 数量 ${beforeQty} -> ${Math.max(nextQty, 0)}（${payload.quantityDelta >= 0 ? '+' : ''}${payload.quantityDelta}）`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: target.id });
    return { ok: true };
  }

  async selfAdjustInventory(shopId: number, userId: number, dto: SelfInventoryAdjustDto) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ctx.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    if (!dto.quantityDelta) return { ok: true };

    const inv = await this.prisma.inventory.findUnique({ where: { memberId_name: { memberId: actor.id, name: dto.name } } });
    const beforeQty = inv?.quantity ?? 0;
    const nextQty = beforeQty + dto.quantityDelta;
    if (nextQty <= 0) {
      if (inv) await this.prisma.inventory.delete({ where: { id: inv.id } });
    } else if (inv) {
      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: nextQty, icon: null, extraDesc: null },
      });
    } else {
      const maxSort = await this.prisma.inventory.aggregate({
        where: { memberId: actor.id },
        _max: { sortOrder: true },
      });
      await this.prisma.inventory.create({
        data: {
          memberId: actor.id,
          name: dto.name,
          icon: null,
          extraDesc: null,
          quantity: nextQty,
          sortOrder: (maxSort._max?.sortOrder ?? 0) + 1,
        },
      });
    }

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: actor.id,
        actorId: actor.id,
        type: 'self_inventory_adjust',
        content: `顾客自助背包 ${dto.name} 数量 ${beforeQty} -> ${Math.max(nextQty, 0)}（${dto.quantityDelta >= 0 ? '+' : ''}${dto.quantityDelta}）`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: actor.id });
    return { ok: true };
  }

  async renameInventory(shopId: number, userId: number, dto: { memberId?: number; oldName: string; newName: string }) {
    const actor = await this.ctx.requireMember(shopId, userId);
    const shop = await this.ctx.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');

    const oldName = (dto.oldName ?? '').trim();
    const newName = (dto.newName ?? '').trim();
    if (!oldName || !newName) throw new BadRequestException('物品名不能为空');
    if (oldName === newName) return { ok: true };

    let targetMemberId: number;
    if (actor.role === ShopRole.CUSTOMER) {
      targetMemberId = actor.id;
    } else {
      if (!dto.memberId) throw new BadRequestException('请指定要操作的顾客');
      this.ctx.ensureShopManager(actor.role);
      const target = await this.prisma.member.findFirst({ where: { id: dto.memberId, shopId, isActive: true } });
      if (!target) throw new NotFoundException('成员不存在');
      if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有背包');
      targetMemberId = target.id;
    }

    await this.prisma.$transaction(async (tx) => {
      const from = await tx.inventory.findUnique({ where: { memberId_name: { memberId: targetMemberId, name: oldName } } });
      if (!from) throw new NotFoundException('物品不存在');

      const to = await tx.inventory.findUnique({ where: { memberId_name: { memberId: targetMemberId, name: newName } } });
      if (!to) {
        await tx.inventory.update({ where: { id: from.id }, data: { name: newName } });
      } else {
        await tx.inventory.update({ where: { id: to.id }, data: { quantity: to.quantity + from.quantity } });
        await tx.inventory.delete({ where: { id: from.id } });
      }

      await tx.log.create({
        data: {
          shopId,
          memberId: targetMemberId,
          actorId: actor.id,
          type: actor.role === ShopRole.CUSTOMER ? 'self_inventory_rename' : 'inventory_rename',
          content: `背包物品改名 ${oldName} -> ${newName}`,
          amount: 0,
        },
      });
    });

    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: targetMemberId });
    return { ok: true };
  }
}
