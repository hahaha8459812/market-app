import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductPriceState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { CreateCurrencyDto } from '../dto/create-currency.dto';
import { DeleteCurrencyDto } from '../dto/delete-currency.dto';
import { UpdateCurrencyDto } from '../dto/update-currency.dto';
import { ShopContextService } from './shop-context.service';

@Injectable()
export class ShopCurrencyService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async listCurrencies(shopId: number, userId: number) {
    await this.ctx.requireMember(shopId, userId);
    return this.prisma.currency.findMany({
      where: { shopId },
      select: { id: true, name: true, isActive: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  async createCurrency(shopId: number, userId: number, dto: CreateCurrencyDto) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
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
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
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
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    if (!dto.confirm) throw new BadRequestException('需要确认删除');
    const currency = await this.prisma.currency.findFirst({ where: { id: currencyId, shopId } });
    if (!currency) throw new NotFoundException('币种不存在');

    await this.prisma.$transaction(async (tx) => {
      await tx.currency.update({ where: { id: currencyId }, data: { isActive: false } });

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
}

