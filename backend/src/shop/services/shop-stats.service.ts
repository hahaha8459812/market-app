import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShopContextService } from './shop-context.service';
import { ShopRole } from '@prisma/client';

@Injectable()
export class ShopStatsService {
  constructor(
    private prisma: PrismaService,
    private ctx: ShopContextService,
  ) {}

  async getShopStats(shopId: number, userId: number, include?: string) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const shop = await this.ctx.ensureShop(shopId);

    const [members, stalls, products, currencies, inventoryItems] = await Promise.all([
      this.prisma.member.count({ where: { shopId, isActive: true } }),
      this.prisma.stall.count({ where: { shopId } }),
      this.prisma.product.count({ where: { stall: { shopId } } }),
      this.prisma.currency.count({ where: { shopId } }),
      this.prisma.inventory.count({ where: { member: { shopId } } }),
    ]);

    const customers = await this.prisma.member.count({ where: { shopId, isActive: true, role: ShopRole.CUSTOMER } });

    const payload: any = {
      shop: { id: shop.id, name: shop.name },
      counts: { members, customers, stalls, products, currencies, inventoryItems },
    };

    return payload;
  }
}
