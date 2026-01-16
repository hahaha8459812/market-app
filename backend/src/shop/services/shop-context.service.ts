import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ShopRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShopContextService {
  constructor(private prisma: PrismaService) {}

  ensureShopManager(shopRole: ShopRole) {
    if (shopRole !== ShopRole.OWNER && shopRole !== ShopRole.CLERK) {
      throw new ForbiddenException('仅店长/店员可操作');
    }
  }

  async ensureShop(shopId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    return shop;
  }

  async requireMember(shopId: number, userId: number) {
    const member = await this.prisma.member.findUnique({ where: { shopId_userId: { shopId, userId } } });
    if (!member || !member.isActive) throw new ForbiddenException('未加入该小店');
    return member;
  }
}

