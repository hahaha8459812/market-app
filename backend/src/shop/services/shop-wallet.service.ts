import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { GrantBalanceDto } from '../dto/grant-balance.dto';
import { ShopContextService } from './shop-context.service';
import { ShopRole, WalletMode } from '@prisma/client';

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

  async grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    const actor = await this.ctx.requireMember(shopId, actorUserId);
    this.ctx.ensureShopManager(actor.role);
    const shop = await this.ctx.ensureShop(shopId);
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

  async selfAdjustBalance(shopId: number, userId: number, currencyId: number, amount: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ctx.ensureShop(shopId);
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
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const shop = await this.ctx.ensureShop(shopId);
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
}

