import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { CreateShopDto } from '../dto/create-shop.dto';
import { ShopContextService } from './shop-context.service';
import { Role, ShopRole } from '@prisma/client';

@Injectable()
export class ShopCoreService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

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
    const member = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(member.role);
    const updated = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        name: dto.name,
      },
    });
    this.ws.emitToShop(shopId, { type: 'shop_updated', shopId });
    return updated;
  }

  async deleteShop(shopId: number, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    if (member.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可注销小店');
    await this.prisma.$transaction(async (tx) => {
      await tx.log.deleteMany({ where: { shopId } });
      await tx.inventory.deleteMany({ where: { member: { shopId } } });
      await tx.memberBalance.deleteMany({ where: { member: { shopId } } });
      await tx.member.deleteMany({ where: { shopId } });
      await tx.product.deleteMany({ where: { stall: { shopId } } });
      await tx.stall.deleteMany({ where: { shopId } });
      await tx.inviteCode.deleteMany({ where: { shopId } });
      await tx.currency.deleteMany({ where: { shopId } });
      await tx.shop.delete({ where: { id: shopId } });
    });

    this.ws.emitToShop(shopId, { type: 'shop_deleted', shopId });
    return { ok: true };
  }

  async shopSummary(shopId: number, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    const shop = await this.ctx.ensureShop(shopId);
    const currencies = await this.prisma.currency.findMany({
      where: { shopId },
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    });

    let personalBalances: Array<{ currencyId: number; amount: number }> = [];

    if (member.role === ShopRole.CUSTOMER) {
      personalBalances = await this.prisma.memberBalance.findMany({
        where: { memberId: member.id },
        select: { currencyId: true, amount: true },
        orderBy: { currencyId: 'asc' },
      });
    }

    return {
      shop,
      member,
      currencies,
      balances: {
        personal: personalBalances,
      },
    };
  }
}
