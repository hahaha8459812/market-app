import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ShopService {
  constructor(private prisma: PrismaService) {}

  private ensureAdmin(role: Role) {
    if (role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('仅超级管理员可操作');
    }
  }

  async listShops() {
    return this.prisma.shop.findMany({
      include: { stalls: { include: { products: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShop(dto: CreateShopDto, user: { userId: number; role: Role }) {
    this.ensureAdmin(user.role);
    return this.prisma.shop.create({
      data: {
        name: dto.name,
        ownerId: user.userId,
        inviteCode: this.buildInviteCode(),
        currencyRules: dto.currencyRules,
      },
    });
  }

  async createStall(shopId: number, dto: CreateStallDto, user: { role: Role }) {
    this.ensureAdmin(user.role);
    await this.ensureShop(shopId);
    return this.prisma.stall.create({ data: { shopId, name: dto.name, description: dto.description } });
  }

  async createProduct(stallId: number, dto: CreateProductDto, user: { role: Role }) {
    this.ensureAdmin(user.role);
    const stall = await this.prisma.stall.findUnique({ where: { id: stallId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    return this.prisma.product.create({
      data: {
        stallId,
        name: dto.name,
        icon: dto.icon,
        price: dto.price,
        stock: dto.stock,
        isLimitStock: dto.isLimitStock ?? true,
        description: dto.description,
      },
    });
  }

  async grantBalance(shopId: number, dto: GrantBalanceDto, user: { role: Role }) {
    this.ensureAdmin(user.role);
    await this.ensureShop(shopId);
    const member = await this.prisma.member.upsert({
      where: { shopId_charName: { shopId, charName: dto.charName } },
      update: { balanceRaw: { increment: dto.amount } },
      create: { shopId, charName: dto.charName, balanceRaw: dto.amount },
    });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: member.id,
        type: 'grant',
        content: `发放余额 ${dto.amount}`,
        amount: dto.amount,
      },
    });
    return member;
  }

  async purchase(shopId: number, dto: PurchaseDto, user: { role: Role }) {
    // allow player in future; currently admin triggers demo
    await this.ensureShop(shopId);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: { stall: true },
      });
      if (!product || product.stall.shopId !== shopId) throw new NotFoundException('商品不存在');
      if (product.isLimitStock && product.stock < dto.quantity) throw new BadRequestException('库存不足');

      const cost = product.price * dto.quantity;
      const member = await tx.member.upsert({
        where: { shopId_charName: { shopId, charName: dto.charName } },
        update: {},
        create: { shopId, charName: dto.charName, balanceRaw: 0 },
      });

      if (member.balanceRaw < cost) throw new BadRequestException('余额不足');

      await tx.member.update({
        where: { id: member.id },
        data: { balanceRaw: { decrement: cost } },
      });

      if (product.isLimitStock) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: dto.quantity } },
        });
      }

      await tx.inventory.upsert({
        where: { memberId_productName: { memberId: member.id, productName: product.name } },
        update: { quantity: { increment: dto.quantity } },
        create: {
          memberId: member.id,
          productName: product.name,
          icon: product.icon,
          quantity: dto.quantity,
        },
      });

      await tx.log.create({
        data: {
          shopId,
          memberId: member.id,
          type: 'purchase',
          content: `购买 ${product.name} x${dto.quantity}`,
          amount: -cost,
        },
      });

      return { cost, memberId: member.id, productId: product.id };
    });
  }

  private buildInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async ensureShop(shopId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    return shop;
  }
}
