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
      where: { shopId, isActive: true },
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
      // 清理所有关联数据，避免留下无意义耦合
      await tx.memberBalance.deleteMany({ where: { currencyId, member: { shopId } } });
      await tx.teamBalance.deleteMany({ where: { shopId, currencyId } });
      await tx.product.updateMany({
        where: { stall: { shopId }, priceCurrencyId: currencyId },
        data: { priceState: ProductPriceState.UNPRICED, priceAmount: null, priceCurrencyId: null },
      });
      await tx.log.updateMany({ where: { shopId, currencyId }, data: { currencyId: null } });

      await tx.log.create({
        data: {
          shopId,
          actorId: actor.id,
          type: 'currency_delete',
          content: `删除币种 ${currency.name}（ID ${currency.id}）并清理关联余额/定价/日志引用`,
          amount: 0,
        },
      });

      // 真删除（物理删除）
      await tx.currency.delete({ where: { id: currencyId } });
    });

    this.ws.emitToShop(shopId, { type: 'currencies_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'products_changed', shopId });
    return { ok: true };
  }
}
