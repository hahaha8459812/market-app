import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ShopRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { GrantBalanceDto } from '../dto/grant-balance.dto';
import { ShopContextService } from './shop-context.service';

@Injectable()
export class ShopWalletService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async setCustomerAdjustSwitches(shopId: number, userId: number, allowInc?: boolean, allowDec?: boolean) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
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

  async getMemberBalances(shopId: number, actorUserId: number, memberId: number) {
    const actor = await this.ctx.requireMember(shopId, actorUserId);
    this.ctx.ensureShopManager(actor.role);
    const target = await this.prisma.member.findFirst({ where: { id: memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有余额');
    return this.prisma.memberBalance.findMany({
      where: { memberId: target.id },
      select: { currencyId: true, amount: true },
      orderBy: { currencyId: 'asc' },
    });
  }

  async grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    const actor = await this.ctx.requireMember(shopId, actorUserId);
    this.ctx.ensureShopManager(actor.role);
    if (!dto.memberId) throw new BadRequestException('请选择顾客');

    const currency = await this.prisma.currency.findFirst({ where: { id: dto.currencyId, shopId, isActive: true } });
    if (!currency) throw new BadRequestException('币种不存在或已删除');

    const target = await this.prisma.member.findFirst({ where: { id: dto.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('顾客不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('仅顾客有个人余额');

    const row = await this.prisma.memberBalance.findUnique({ where: { memberId_currencyId: { memberId: target.id, currencyId: dto.currencyId } } });
    const before = row?.amount ?? 0;
    const after = before + dto.amount;
    if (after < 0) throw new BadRequestException('余额不足');
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
        type: 'grant_balance',
        currencyId: dto.currencyId,
        content: `余额加减 ${dto.amount}（${currency.name}）`,
        amount: dto.amount,
        beforeAmount: before,
        afterAmount: after,
      },
    });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId, memberId: target.id });
    return { ok: true };
  }

  async selfAdjustBalance(shopId: number, userId: number, currencyId: number, amount: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ctx.ensureShop(shopId);

    const currency = await this.prisma.currency.findFirst({ where: { id: currencyId, shopId, isActive: true } });
    if (!currency) throw new BadRequestException('币种不存在或已删除');

    if (amount > 0 && !shop.allowCustomerInc) throw new ForbiddenException('当前不允许顾客自增余额');
    if (amount < 0 && !shop.allowCustomerDec) throw new ForbiddenException('当前不允许顾客自减余额');
    if (amount === 0) return { ok: true };

    const row = await this.prisma.memberBalance.findUnique({ where: { memberId_currencyId: { memberId: actor.id, currencyId } } });
    const before = row?.amount ?? 0;
    const after = before + amount;
    if (after < 0) throw new BadRequestException('余额不足');
    await this.prisma.memberBalance.upsert({
      where: { memberId_currencyId: { memberId: actor.id, currencyId } },
      update: { amount: after },
      create: { memberId: actor.id, currencyId, amount: after },
    });

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: actor.id,
        actorId: actor.id,
        type: 'self_adjust_balance',
        currencyId,
        content: `顾客自助调整余额 ${amount}（${currency.name}）`,
        amount,
        beforeAmount: before,
        afterAmount: after,
      },
    });

    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId, memberId: actor.id });
    return { ok: true };
  }
}

