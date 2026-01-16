import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductPriceState, ShopRole, WalletMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { PurchaseDto } from '../dto/purchase.dto';
import { ShopContextService } from './shop-context.service';

@Injectable()
export class ShopProductService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async createProduct(stallId: number, dto: CreateProductDto, userId: number) {
    const stall = await this.prisma.stall.findUnique({ where: { id: stallId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const member = await this.ctx.requireMember(stall.shopId, userId);
    this.ctx.ensureShopManager(member.role);
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
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);

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
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
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

  async purchase(shopId: number, dto: PurchaseDto, userId: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可购买');
    const current = await this.ctx.ensureShop(shopId);
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

      const maxSort = await tx.inventory.aggregate({
        where: { memberId: member.id },
        _max: { sortOrder: true },
      });
      await tx.inventory.upsert({
        where: { memberId_name: { memberId: member.id, name: product.name } },
        update: { quantity: { increment: dto.quantity } },
        create: {
          memberId: member.id,
          productId: null,
          name: product.name,
          icon: null,
          quantity: dto.quantity,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          extraDesc: null,
        },
      });

      return { cost, memberId: member.id, productId: product.id };
    });
    this.ws.emitToShop(shopId, { type: 'purchase', shopId, memberId: result.memberId, productId: result.productId });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    this.ws.emitToShop(shopId, { type: 'product_stock_changed', shopId, productId: result.productId });
    return result;
  }
}

