import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { Prisma, ProductPriceState, Role, ShopRole, WalletMode } from '@prisma/client';
import { WsService } from '../ws/ws.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { DeleteCurrencyDto } from './dto/delete-currency.dto';
import { SelfInventoryAdjustDto } from './dto/self-inventory.dto';

@Injectable()
export class ShopService {
  constructor(private prisma: PrismaService, private ws: WsService) {}

  private ensureShopManager(shopRole: ShopRole) {
    if (shopRole !== ShopRole.OWNER && shopRole !== ShopRole.CLERK) {
      throw new ForbiddenException('仅店长/店员可操作');
    }
  }

  async listMyShops(userId: number) {
    const members = await this.prisma.member.findMany({
      where: { userId, isActive: true },
      include: { shop: true },
      orderBy: { id: 'desc' },
    });
    return members.map((m) => ({
      shopId: m.shopId,
      role: m.role,
      charName: m.charName,
      shop: m.shop,
    }));
  }

  async createShop(dto: CreateShopDto, user: { userId: number; role: Role }) {
    if (user.role !== Role.PLAYER) throw new ForbiddenException('该账号不能创建小店');
    const shop = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shop.create({
        data: {
          name: dto.name,
          ownerId: user.userId,
        },
      });
      await tx.member.create({
        data: {
          shopId: created.id,
          userId: user.userId,
          charName: '店长',
          role: ShopRole.OWNER,
        },
      });
      await tx.currency.createMany({
        data: [
          { shopId: created.id, name: '金币' },
          { shopId: created.id, name: '银币' },
          { shopId: created.id, name: '铜币' },
        ],
      });
      return created;
    });
    return shop;
  }

  async updateShop(shopId: number, userId: number, dto: { name?: string }) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    const updated = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        name: dto.name,
      },
    });
    this.ws.emitToShop(shopId, { type: 'shop_updated', shopId });
    return updated;
  }

  async joinShop(dto: JoinShopDto, userId: number) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } });
    if (!invite || !invite.isActive || invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('邀请码无效或已过期');
    }
    const shop = await this.prisma.shop.findUnique({ where: { id: invite.shopId } });
    if (!shop) throw new NotFoundException('小店不存在');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const charName = user.username;

    const existing = await this.prisma.member.findUnique({
      where: { shopId_userId: { shopId: shop.id, userId } },
    });
    if (existing && existing.isActive) return existing;
    if (existing && !existing.isActive) {
      return this.prisma.member.update({
        where: { id: existing.id },
        data: { isActive: true, charName, role: ShopRole.CUSTOMER },
      });
    }

    const created = await this.prisma.member.create({
      data: { shopId: shop.id, userId, charName, role: ShopRole.CUSTOMER },
    });
    this.ws.emitToShop(shop.id, { type: 'member_joined', shopId: shop.id });
    return created;
  }

  async updateMyCharName(shopId: number, userId: number, charNameRaw: string) {
    const member = await this.requireMember(shopId, userId);
    const shop = await this.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    const charName = (charNameRaw ?? '').trim();
    if (!charName) throw new BadRequestException('角色名不能为空');

    const updated = await this.prisma.member.update({ where: { id: member.id }, data: { charName } });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: member.id,
        actorId: member.id,
        type: 'char_name',
        content: `修改角色名为 ${charName}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_updated', shopId, memberId: member.id });
    return updated;
  }

  async leaveShop(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    if (member.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可退出小店');
    const updated = await this.prisma.member.update({ where: { id: member.id }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'member_left', shopId });
    return updated;
  }

  async shopSummary(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    const shop = await this.ensureShop(shopId);
    const currencies = await this.prisma.currency.findMany({
      where: { shopId },
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    });

    let personalBalances: Array<{ currencyId: number; amount: number }> = [];
    let teamBalances: Array<{ currencyId: number; amount: number }> = [];

    if (member.role === ShopRole.CUSTOMER) {
      if (shop.walletMode === WalletMode.TEAM) {
        teamBalances = await this.prisma.teamBalance.findMany({
          where: { shopId },
          select: { currencyId: true, amount: true },
          orderBy: { currencyId: 'asc' },
        });
      } else {
        personalBalances = await this.prisma.memberBalance.findMany({
          where: { memberId: member.id },
          select: { currencyId: true, amount: true },
          orderBy: { currencyId: 'asc' },
        });
      }
    } else {
      // manager view: provide team balances for display when TEAM
      if (shop.walletMode === WalletMode.TEAM) {
        teamBalances = await this.prisma.teamBalance.findMany({
          where: { shopId },
          select: { currencyId: true, amount: true },
          orderBy: { currencyId: 'asc' },
        });
      }
    }

    return {
      shop,
      member,
      currencies,
      balances: {
        personal: personalBalances,
        team: teamBalances,
      },
    };
  }

  async createInvite(shopId: number, userId: number, dto: CreateInviteDto) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const ttl = Math.min(Math.max(dto.ttlMinutes ?? 10, 1), 60);
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    let invite: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.buildInviteCode();
      try {
        invite = await this.prisma.inviteCode.create({
          data: { shopId, code, expiresAt, createdBy: actor.id },
        });
        break;
      } catch (err: any) {
        // P2002: Unique constraint failed
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
    if (!invite) throw new BadRequestException('生成邀请码失败，请重试');
    this.ws.emitToShop(shopId, { type: 'invite_created', shopId });
    return invite;
  }

  async listInvites(shopId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const now = new Date();
    return this.prisma.inviteCode.findMany({
      where: { shopId, isActive: true, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async deleteInvite(shopId: number, inviteId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const invite = await this.prisma.inviteCode.findFirst({ where: { id: inviteId, shopId } });
    if (!invite) throw new NotFoundException('邀请码不存在');
    await this.prisma.inviteCode.update({ where: { id: inviteId }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'invite_deleted', shopId });
    return { ok: true };
  }

  async listMembers(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, userId: true, charName: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  async setMemberRole(shopId: number, userId: number, targetMemberId: number, role: ShopRole) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可任命/撤销店员');
    const target = await this.prisma.member.findFirst({ where: { id: targetMemberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role === ShopRole.OWNER) throw new BadRequestException('不能修改店长身份');

    const updated = await this.prisma.member.update({ where: { id: target.id }, data: { role } });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: updated.id,
        actorId: actor.id,
        type: 'member_role',
        content: `设置身份为 ${role}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_role_changed', shopId, memberId: updated.id, role });
    return updated;
  }

  async deleteShop(shopId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可注销小店');

    await this.prisma.$transaction(async (tx) => {
      await tx.log.deleteMany({ where: { shopId } });
      await tx.inventory.deleteMany({ where: { member: { shopId } } });
      await tx.member.deleteMany({ where: { shopId } });
      await tx.product.deleteMany({ where: { stall: { shopId } } });
      await tx.stall.deleteMany({ where: { shopId } });
      await tx.inviteCode.deleteMany({ where: { shopId } });
      await tx.shop.delete({ where: { id: shopId } });
    });

    this.ws.emitToShop(shopId, { type: 'shop_deleted', shopId });
    return { ok: true };
  }

  async listPublicMembers(shopId: number, userId: number) {
    await this.requireMember(shopId, userId);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, charName: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  async getInventory(shopId: number, userId: number, memberId?: number) {
    const member = await this.requireMember(shopId, userId);
    if (member.role !== ShopRole.CUSTOMER && !memberId) {
      throw new BadRequestException('请指定要查看的顾客');
    }
    const targetId =
      member.role === ShopRole.CUSTOMER
        ? member.id
        : memberId ?? member.id;

    if (member.role !== ShopRole.CUSTOMER && memberId) {
      this.ensureShopManager(member.role);
      const target = await this.prisma.member.findFirst({ where: { id: memberId, shopId, isActive: true } });
      if (!target) throw new NotFoundException('成员不存在');
      if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有背包');
    }

    return this.prisma.inventory.findMany({
      where: { memberId: targetId },
      select: { id: true, name: true, quantity: true },
      orderBy: { id: 'asc' },
    });
  }

  async adjustInventory(shopId: number, userId: number, payload: { memberId: number; name: string; quantityDelta: number }) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const target = await this.prisma.member.findFirst({ where: { id: payload.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有背包');

    const inv = await this.prisma.inventory.findUnique({ where: { memberId_name: { memberId: target.id, name: payload.name } } });
    const nextQty = (inv?.quantity ?? 0) + payload.quantityDelta;
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
      await this.prisma.inventory.create({
        data: { memberId: target.id, name: payload.name, icon: null, extraDesc: null, quantity: nextQty },
      });
    }

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: target.id,
        actorId: actor.id,
        type: 'inventory_adjust',
        content: `背包 ${payload.name} 数量变更 ${payload.quantityDelta}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: target.id });
    return { ok: true };
  }

  async selfAdjustInventory(shopId: number, userId: number, dto: SelfInventoryAdjustDto) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    if (!dto.quantityDelta) return { ok: true };

    const inv = await this.prisma.inventory.findUnique({ where: { memberId_name: { memberId: actor.id, name: dto.name } } });
    const nextQty = (inv?.quantity ?? 0) + dto.quantityDelta;
    if (nextQty <= 0) {
      if (inv) await this.prisma.inventory.delete({ where: { id: inv.id } });
    } else if (inv) {
      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: nextQty, icon: null, extraDesc: null },
      });
    } else {
      await this.prisma.inventory.create({
        data: { memberId: actor.id, name: dto.name, icon: null, extraDesc: null, quantity: nextQty },
      });
    }

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: actor.id,
        actorId: actor.id,
        type: 'self_inventory_adjust',
        content: `顾客自助背包 ${dto.name} 数量变更 ${dto.quantityDelta}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: actor.id });
    return { ok: true };
  }

  async renameInventory(shopId: number, userId: number, dto: { memberId?: number; oldName: string; newName: string }) {
    const actor = await this.requireMember(shopId, userId);
    const shop = await this.ensureShop(shopId);
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
      this.ensureShopManager(actor.role);
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

  async listCurrencies(shopId: number, userId: number) {
    await this.requireMember(shopId, userId);
    return this.prisma.currency.findMany({
      where: { shopId },
      select: { id: true, name: true, isActive: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  async createCurrency(shopId: number, userId: number, dto: CreateCurrencyDto) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('币种名不能为空');
    const created = await this.prisma.currency.create({ data: { shopId, name } });
    await this.prisma.log.create({
      data: {
        shopId,
        actorId: actor.id,
        type: 'currency_create',
        content: `创建币种 ${name}（ID ${created.id}）`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'currencies_changed', shopId });
    return created;
  }

  async updateCurrency(shopId: number, userId: number, currencyId: number, dto: UpdateCurrencyDto) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const currency = await this.prisma.currency.findFirst({ where: { id: currencyId, shopId } });
    if (!currency) throw new NotFoundException('币种不存在');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('币种名不能为空');
    const updated = await this.prisma.currency.update({ where: { id: currencyId }, data: { name } });
    await this.prisma.log.create({
      data: {
        shopId,
        actorId: actor.id,
        currencyId,
        type: 'currency_rename',
        content: `币种改名：${currency.name} -> ${name}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'currencies_changed', shopId });
    return updated;
  }

  async deleteCurrency(shopId: number, userId: number, currencyId: number, dto: DeleteCurrencyDto) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    if (!dto.confirm) throw new BadRequestException('需要确认删除');
    const currency = await this.prisma.currency.findFirst({ where: { id: currencyId, shopId } });
    if (!currency) throw new NotFoundException('币种不存在');

    await this.prisma.$transaction(async (tx) => {
      await tx.currency.update({ where: { id: currencyId }, data: { isActive: false } });

      // clear balances
      const team = await tx.teamBalance.findUnique({ where: { shopId_currencyId: { shopId, currencyId } } });
      const teamBefore = team?.amount ?? 0;
      if (teamBefore !== 0) {
        await tx.teamBalance.upsert({
          where: { shopId_currencyId: { shopId, currencyId } },
          update: { amount: 0 },
          create: { shopId, currencyId, amount: 0 },
        });
      }

      const personalSum = await tx.memberBalance.aggregate({
        where: { currencyId, member: { shopId } },
        _sum: { amount: true },
      });
      await tx.memberBalance.updateMany({ where: { currencyId, member: { shopId } }, data: { amount: 0 } });

      // mark products using this currency as disabled currency
      await tx.product.updateMany({
        where: { stall: { shopId }, priceCurrencyId: currencyId },
        data: { priceState: ProductPriceState.DISABLED_CURRENCY, priceAmount: null, priceCurrencyId: null },
      });

      await tx.log.create({
        data: {
          shopId,
          actorId: actor.id,
          currencyId,
          type: 'currency_delete',
          content: `删除币种 ${currency.name}（清零队伍 ${teamBefore}，清零个人合计 ${personalSum._sum.amount ?? 0}；相关商品变为无标价）`,
          amount: 0,
        },
      });
    });

    this.ws.emitToShop(shopId, { type: 'currencies_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'products_changed', shopId });
    return { ok: true };
  }

  async createStall(shopId: number, dto: CreateStallDto, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    await this.ensureShop(shopId);
    const stall = await this.prisma.stall.create({ data: { shopId, name: dto.name, description: dto.description } });
    this.ws.emitToShop(shopId, { type: 'stall_created', shopId, stallId: stall.id });
    return stall;
  }

  async updateStall(shopId: number, stallId: number, userId: number, dto: { name?: string; description?: string; isActive?: boolean }) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const stall = await this.prisma.stall.findFirst({ where: { id: stallId, shopId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const updated = await this.prisma.stall.update({ where: { id: stallId }, data: dto });
    await this.prisma.log.create({
      data: { shopId, actorId: actor.id, type: 'stall_update', content: `修改摊位 ${stallId}`, amount: 0 },
    });
    this.ws.emitToShop(shopId, { type: 'stall_updated', shopId, stallId });
    return updated;
  }

  async deleteStall(shopId: number, stallId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const stall = await this.prisma.stall.findFirst({ where: { id: stallId, shopId } });
    if (!stall) throw new NotFoundException('摊位不存在');

    await this.prisma.$transaction(async (tx) => {
      await tx.product.deleteMany({ where: { stallId } });
      await tx.stall.delete({ where: { id: stallId } });
      await tx.log.create({
        data: { shopId, actorId: actor.id, type: 'stall_delete', content: `删除摊位 ${stallId}（${stall.name}）`, amount: 0 },
      });
    });

    this.ws.emitToShop(shopId, { type: 'stall_deleted', shopId, stallId });
    return { ok: true };
  }

  async createProduct(stallId: number, dto: CreateProductDto, userId: number) {
    const stall = await this.prisma.stall.findUnique({ where: { id: stallId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const member = await this.requireMember(stall.shopId, userId);
    this.ensureShopManager(member.role);
    const state: ProductPriceState = (dto.priceState as any) ?? ProductPriceState.UNPRICED;
    if (state === ProductPriceState.PRICED) {
      if (dto.priceAmount === undefined || dto.priceCurrencyId === undefined) throw new BadRequestException('请提供定价金额与币种');
      const currency = await this.prisma.currency.findFirst({ where: { id: dto.priceCurrencyId, shopId: stall.shopId, isActive: true } });
      if (!currency) throw new BadRequestException('币种不存在或已删除');
    }
    const maxSort = await this.prisma.product.aggregate({
      where: { stallId },
      _max: { sortOrder: true },
    });

    const product = await this.prisma.product.create({
      data: {
        stallId,
        name: dto.name,
        icon: dto.icon,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        priceState: state,
        priceAmount: state === ProductPriceState.PRICED ? dto.priceAmount! : null,
        priceCurrencyId: state === ProductPriceState.PRICED ? dto.priceCurrencyId! : null,
        stock: dto.stock,
        isLimitStock: dto.isLimitStock ?? true,
        description: dto.description,
      },
    });
    this.ws.emitToShop(stall.shopId, { type: 'product_created', shopId: stall.shopId, stallId, productId: product.id });
    return product;
  }

  async reorderProducts(shopId: number, stallId: number, userId: number, productIds: number[]) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);

    const stall = await this.prisma.stall.findFirst({
      where: { id: stallId, shopId },
      select: { id: true },
    });
    if (!stall) throw new NotFoundException('摊位不存在');

    const uniqueIds = Array.from(new Set(productIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))));
    if (uniqueIds.length !== productIds.length) throw new BadRequestException('商品列表存在重复或非法 id');

    const existing = await this.prisma.product.findMany({
      where: { stallId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const existingIds = existing.map((p) => p.id);

    if (existingIds.length === 0) return { ok: true };
    if (uniqueIds.length !== existingIds.length) throw new BadRequestException('商品列表不完整，请刷新后重试');

    const existingSet = new Set(existingIds);
    for (const id of uniqueIds) {
      if (!existingSet.has(id)) throw new BadRequestException('商品不属于该摊位，请刷新后重试');
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < uniqueIds.length; i++) {
        await tx.product.update({
          where: { id: uniqueIds[i] },
          data: { sortOrder: i + 1 },
        });
      }
      await tx.log.create({
        data: { shopId, actorId: actor.id, type: 'product_reorder', content: `排序摊位 ${stallId} 商品`, amount: 0 },
      });
    });

    this.ws.emitToShop(shopId, { type: 'products_reordered', shopId, stallId });
    return { ok: true };
  }

  async updateProduct(shopId: number, productId: number, userId: number, dto: any) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const product = await this.prisma.product.findFirst({ where: { id: productId, stall: { shopId } }, include: { stall: true } });
    if (!product) throw new NotFoundException('商品不存在');
    const nextState: ProductPriceState | undefined =
      dto.priceState ? (dto.priceState as ProductPriceState) : undefined;

    if (nextState === ProductPriceState.PRICED) {
      if (dto.priceAmount === undefined || dto.priceCurrencyId === undefined) throw new BadRequestException('请提供定价金额与币种');
      const currency = await this.prisma.currency.findFirst({ where: { id: dto.priceCurrencyId, shopId, isActive: true } });
      if (!currency) throw new BadRequestException('币种不存在或已删除');
    }

    const data: any = { ...dto };
    if (nextState === ProductPriceState.UNPRICED) {
      data.priceAmount = null;
      data.priceCurrencyId = null;
      data.priceState = ProductPriceState.UNPRICED;
    }
    if (nextState === ProductPriceState.PRICED) {
      data.priceState = ProductPriceState.PRICED;
      data.priceAmount = dto.priceAmount;
      data.priceCurrencyId = dto.priceCurrencyId;
    }
    // Prevent setting DISABLED_CURRENCY manually; it's system-managed.
    if (dto.priceState === ProductPriceState.DISABLED_CURRENCY) {
      throw new BadRequestException('该状态由系统维护');
    }

    const updated = await this.prisma.product.update({ where: { id: productId }, data });
    await this.prisma.log.create({
      data: { shopId, actorId: actor.id, type: 'product_update', content: `修改商品 ${productId}`, amount: 0 },
    });
    this.ws.emitToShop(shopId, { type: 'product_updated', shopId, stallId: product.stallId, productId });
    return updated;
  }

  async grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    const actor = await this.requireMember(shopId, actorUserId);
    this.ensureShopManager(actor.role);
    const shop = await this.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    const currency = await this.prisma.currency.findFirst({ where: { id: dto.currencyId, shopId, isActive: true } });
    if (!currency) throw new BadRequestException('币种不存在或已删除');

    if (dto.target === 'team') {
      if (shop.walletMode !== WalletMode.TEAM) throw new BadRequestException('当前不是全队钱包模式');
      const row = await this.prisma.teamBalance.findUnique({ where: { shopId_currencyId: { shopId, currencyId: dto.currencyId } } });
      const before = row?.amount ?? 0;
      const after = before + dto.amount;
      if (after < 0) throw new BadRequestException('队伍余额不足');
      await this.prisma.teamBalance.upsert({
        where: { shopId_currencyId: { shopId, currencyId: dto.currencyId } },
        update: { amount: after },
        create: { shopId, currencyId: dto.currencyId, amount: after },
      });
      await this.prisma.log.create({
        data: {
          shopId,
          actorId: actor.id,
          type: 'grant_team',
          scope: 'TEAM',
          currencyId: dto.currencyId,
          content: `队伍余额加减 ${dto.amount}（${currency.name}）`,
          amount: dto.amount,
          beforeAmount: before,
          afterAmount: after,
        },
      });
      this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
      return { ok: true };
    }

    if (!dto.memberId) throw new BadRequestException('请选择顾客');
    const target = await this.prisma.member.findFirst({ where: { id: dto.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('顾客不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有个人余额');
    if (shop.walletMode === WalletMode.TEAM) throw new BadRequestException('全队钱包模式下不可调整个人余额');

    const row = await this.prisma.memberBalance.findUnique({ where: { memberId_currencyId: { memberId: target.id, currencyId: dto.currencyId } } });
    const before = row?.amount ?? 0;
    const after = before + dto.amount;
    if (after < 0) throw new BadRequestException('个人余额不足');
    await this.prisma.memberBalance.upsert({
      where: { memberId_currencyId: { memberId: target.id, currencyId: dto.currencyId } },
      update: { amount: after },
      create: { memberId: target.id, currencyId: dto.currencyId, amount: after },
    });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: target.id,
        actorId: actor.id,
        type: 'grant_personal',
        scope: 'PERSONAL',
        currencyId: dto.currencyId,
        content: `个人余额加减 ${dto.amount}（${currency.name}）`,
        amount: dto.amount,
        beforeAmount: before,
        afterAmount: after,
      },
    });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    return { ok: true };
  }

  async purchase(shopId: number, dto: PurchaseDto, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可购买');
    const current = await this.ensureShop(shopId);
    if (current.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: { stall: true },
      });
      if (!product || product.stall.shopId !== shopId) throw new NotFoundException('商品不存在');
      if (!product.isActive) throw new BadRequestException('商品已下架');
      if (product.priceState !== ProductPriceState.PRICED || product.priceAmount === null || product.priceCurrencyId === null) {
        throw new BadRequestException('商品未定价，无法购买');
      }
      const currency = await tx.currency.findFirst({ where: { id: product.priceCurrencyId, shopId, isActive: true } });
      if (!currency) throw new BadRequestException('商品币种已删除，请联系店长定价');
      if (product.isLimitStock && product.stock < dto.quantity) throw new BadRequestException('库存不足');

      const cost = product.priceAmount * dto.quantity;
      const member = await tx.member.findUnique({ where: { id: actor.id } });
      if (!member || !member.isActive) throw new BadRequestException('成员无效');

      const shop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!shop) throw new NotFoundException('店铺不存在');
      if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');

      if (shop.walletMode === WalletMode.TEAM) {
        const row = await tx.teamBalance.findUnique({ where: { shopId_currencyId: { shopId, currencyId: product.priceCurrencyId } } });
        const before = row?.amount ?? 0;
        const after = before - cost;
        if (after < 0) throw new BadRequestException('队伍余额不足');
        await tx.teamBalance.upsert({
          where: { shopId_currencyId: { shopId, currencyId: product.priceCurrencyId } },
          update: { amount: after },
          create: { shopId, currencyId: product.priceCurrencyId, amount: after },
        });
        await tx.log.create({
          data: {
            shopId,
            memberId: member.id,
            actorId: member.id,
            type: 'purchase',
            scope: 'TEAM',
            currencyId: product.priceCurrencyId,
            content: `购买 ${product.name} x${dto.quantity}（${currency.name}）`,
            amount: -cost,
            beforeAmount: before,
            afterAmount: after,
          },
        });
      } else {
        const row = await tx.memberBalance.findUnique({ where: { memberId_currencyId: { memberId: member.id, currencyId: product.priceCurrencyId } } });
        const before = row?.amount ?? 0;
        const after = before - cost;
        if (after < 0) throw new BadRequestException('个人余额不足');
        await tx.memberBalance.upsert({
          where: { memberId_currencyId: { memberId: member.id, currencyId: product.priceCurrencyId } },
          update: { amount: after },
          create: { memberId: member.id, currencyId: product.priceCurrencyId, amount: after },
        });
        await tx.log.create({
          data: {
            shopId,
            memberId: member.id,
            actorId: member.id,
            type: 'purchase',
            scope: 'PERSONAL',
            currencyId: product.priceCurrencyId,
            content: `购买 ${product.name} x${dto.quantity}（${currency.name}）`,
            amount: -cost,
            beforeAmount: before,
            afterAmount: after,
          },
        });
      }

      if (product.isLimitStock) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: dto.quantity } },
        });
      }

      await tx.inventory.upsert({
        where: { memberId_name: { memberId: member.id, name: product.name } },
        update: { quantity: { increment: dto.quantity } },
        create: { memberId: member.id, productId: null, name: product.name, icon: null, quantity: dto.quantity, extraDesc: null },
      });

      return { cost, memberId: member.id, productId: product.id };
    });
    this.ws.emitToShop(shopId, { type: 'purchase', shopId, memberId: result.memberId, productId: result.productId });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'product_stock_changed', shopId, productId: result.productId });
    return result;
  }

  async listStalls(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    const productsOrderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { sortOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ];
    const productsInclude: Prisma.Stall$productsArgs =
      member.role === ShopRole.CUSTOMER
        ? { where: { isActive: true }, orderBy: productsOrderBy }
        : { orderBy: productsOrderBy };
    return this.prisma.stall.findMany({
      where: member.role === ShopRole.CUSTOMER ? { shopId, isActive: true } : { shopId },
      include: { products: productsInclude },
      orderBy: { id: 'asc' },
    });
  }

  async listLogs(shopId: number, userId: number, limit?: number) {
    const member = await this.requireMember(shopId, userId);
    const max = Math.min(Math.max(limit ?? (member.role === ShopRole.CUSTOMER ? 10 : 50), 1), 200);
    const where =
      member.role === ShopRole.CUSTOMER ? { shopId, memberId: member.id } : { shopId };
    return this.prisma.log.findMany({ where, orderBy: { createdAt: 'desc' }, take: max });
  }

  async getShopStats(shopId: number, userId: number, include?: string) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const shop = await this.ensureShop(shopId);

    const [members, stalls, products, currencies, inventoryItems] = await Promise.all([
      this.prisma.member.count({ where: { shopId, isActive: true } }),
      this.prisma.stall.count({ where: { shopId } }),
      this.prisma.product.count({ where: { stall: { shopId } } }),
      this.prisma.currency.count({ where: { shopId } }),
      this.prisma.inventory.count({ where: { member: { shopId } } }),
    ]);

    const customers = await this.prisma.member.count({ where: { shopId, isActive: true, role: ShopRole.CUSTOMER } });

    const payload: any = {
      shop: { id: shop.id, name: shop.name, walletMode: shop.walletMode, isSwitching: shop.isSwitching },
      counts: { members, customers, stalls, products, currencies, inventoryItems },
    };

    if ((include || '').includes('balances')) {
      payload.balances = {
        team: await this.prisma.teamBalance.findMany({
          where: { shopId },
          select: { currencyId: true, amount: true },
          orderBy: { currencyId: 'asc' },
        }),
      };
    }

    return payload;
  }

  async setCustomerAdjustSwitches(shopId: number, userId: number, allowInc?: boolean, allowDec?: boolean) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const updated = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        allowCustomerInc: allowInc,
        allowCustomerDec: allowDec,
      },
    });
    this.ws.emitToShop(shopId, { type: 'shop_updated', shopId });
    return updated;
  }

  async selfAdjustBalance(shopId: number, userId: number, currencyId: number, amount: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    const currency = await this.prisma.currency.findFirst({ where: { id: currencyId, shopId, isActive: true } });
    if (!currency) throw new BadRequestException('币种不存在或已删除');

    if (amount > 0 && !shop.allowCustomerInc) throw new ForbiddenException('当前不允许顾客自增余额');
    if (amount < 0 && !shop.allowCustomerDec) throw new ForbiddenException('当前不允许顾客自减余额');
    if (amount === 0) return { ok: true };

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: actor.id } });
      if (!member) throw new NotFoundException('成员不存在');

      const currentShop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!currentShop) throw new NotFoundException('店铺不存在');

      if (currentShop.walletMode === WalletMode.TEAM) {
        const row = await tx.teamBalance.findUnique({ where: { shopId_currencyId: { shopId, currencyId } } });
        const before = row?.amount ?? 0;
        const after = before + amount;
        if (after < 0) throw new BadRequestException('队伍余额不足');
        await tx.teamBalance.upsert({
          where: { shopId_currencyId: { shopId, currencyId } },
          update: { amount: after },
          create: { shopId, currencyId, amount: after },
        });
        await tx.log.create({
          data: {
            shopId,
            memberId: member.id,
            actorId: member.id,
            type: 'self_adjust_team',
            scope: 'TEAM',
            currencyId,
            content: `顾客自助调整队伍余额 ${amount}（${currency.name}）`,
            amount,
            beforeAmount: before,
            afterAmount: after,
          },
        });
        return { ok: true };
      }

      const row = await tx.memberBalance.findUnique({ where: { memberId_currencyId: { memberId: member.id, currencyId } } });
      const before = row?.amount ?? 0;
      const after = before + amount;
      if (after < 0) throw new BadRequestException('个人余额不足');
      await tx.memberBalance.upsert({
        where: { memberId_currencyId: { memberId: member.id, currencyId } },
        update: { amount: after },
        create: { memberId: member.id, currencyId, amount: after },
      });
      await tx.log.create({
        data: {
          shopId,
          memberId: member.id,
          actorId: member.id,
          type: 'self_adjust_personal',
          scope: 'PERSONAL',
          currencyId,
          content: `顾客自助调整个人余额 ${amount}（${currency.name}）`,
          amount,
          beforeAmount: before,
          afterAmount: after,
        },
      });
      return { ok: true };
    }).then((res) => {
      this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
      return res;
    });
  }

  async switchWalletMode(shopId: number, userId: number, mode: WalletMode) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const shop = await this.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    if (shop.walletMode === mode) return shop;

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.shop.updateMany({ where: { id: shopId, isSwitching: false }, data: { isSwitching: true } });
      if (locked.count !== 1) throw new BadRequestException('钱包模式切换中，请稍后再试');

      const customers = await tx.member.findMany({
        where: { shopId, isActive: true, role: ShopRole.CUSTOMER },
        orderBy: { id: 'asc' },
      });
      if (!customers.length) throw new BadRequestException('当前小店没有顾客');

      if (mode === WalletMode.TEAM) {
        const sums = await tx.memberBalance.groupBy({
          by: ['currencyId'],
          where: { memberId: { in: customers.map((m) => m.id) } },
          _sum: { amount: true },
        });

        // clear all customer balances
        await tx.memberBalance.updateMany({
          where: { memberId: { in: customers.map((m) => m.id) } },
          data: { amount: 0 },
        });

        for (const row of sums) {
          const total = row._sum.amount ?? 0;
          await tx.teamBalance.upsert({
            where: { shopId_currencyId: { shopId, currencyId: row.currencyId } },
            update: { amount: total },
            create: { shopId, currencyId: row.currencyId, amount: total },
          });
        }

        return tx.shop.update({ where: { id: shopId }, data: { walletMode: WalletMode.TEAM, isSwitching: false } });
      }

      const n = customers.length;
      const receiver = customers[customers.length - 1];

      const teamBalances = await tx.teamBalance.findMany({ where: { shopId } });
      for (const tb of teamBalances) {
        const total = tb.amount;
        if (!total) continue;
        const base = Math.floor(total / n);
        const rem = total % n;
        for (const m of customers) {
          const add = m.id === receiver.id ? base + rem : base;
          await tx.memberBalance.upsert({
            where: { memberId_currencyId: { memberId: m.id, currencyId: tb.currencyId } },
            update: { amount: add },
            create: { memberId: m.id, currencyId: tb.currencyId, amount: add },
          });
        }
        await tx.teamBalance.update({ where: { id: tb.id }, data: { amount: 0 } });
      }

      return tx.shop.update({ where: { id: shopId }, data: { walletMode: WalletMode.PERSONAL, isSwitching: false } });
    }).catch(async (err) => {
      // best-effort unlock if something threw after locking
      try {
        await this.prisma.shop.update({ where: { id: shopId }, data: { isSwitching: false } });
      } catch {
        // ignore
      }
      throw err;
    });

    await this.prisma.log.create({
      data: {
        shopId,
        actorId: actor.id,
        type: 'wallet_mode',
        scope: null,
        content: `钱包模式切换为 ${mode}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'wallet_mode_changed', shopId, mode });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    return updated;
  }

  private buildInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async ensureShop(shopId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    return shop;
  }

  private async requireMember(shopId: number, userId: number) {
    const member = await this.prisma.member.findUnique({ where: { shopId_userId: { shopId, userId } } });
    if (!member || !member.isActive) throw new ForbiddenException('未加入该小店');
    return member;
  }
}
