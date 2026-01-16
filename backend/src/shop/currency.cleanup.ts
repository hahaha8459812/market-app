import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProductPriceState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurrencyCleanup implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.cleanupOnce();
    setInterval(() => {
      this.cleanupOnce().catch(() => {
        // ignore
      });
    }, 60 * 60_000).unref();
  }

  private async cleanupOnce() {
    const inactive = await this.prisma.currency.findMany({
      where: { isActive: false },
      select: { id: true, shopId: true },
      orderBy: { id: 'asc' },
      take: 50,
    });
    if (inactive.length === 0) return;

    for (const c of inactive) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.memberBalance.deleteMany({ where: { currencyId: c.id, member: { shopId: c.shopId } } });
          await tx.product.updateMany({
            where: { stall: { shopId: c.shopId }, priceCurrencyId: c.id },
            data: { priceState: ProductPriceState.UNPRICED, priceAmount: null, priceCurrencyId: null },
          });
          await tx.log.updateMany({ where: { shopId: c.shopId, currencyId: c.id }, data: { currencyId: null } });
          await tx.currency.delete({ where: { id: c.id } });
        });
      } catch {
        // ignore
      }
    }
  }
}
