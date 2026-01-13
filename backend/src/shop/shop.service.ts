import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { AssignWalletDto } from './dto/assign-wallet.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { Role, ShopRole } from '@prisma/client';
import { WsService } from '../ws/ws.service';

@Injectable()
export class ShopService {
  constructor(private prisma: PrismaService, private ws: WsService) {}

  private ensurePlatformAdmin(role: Role) {
    if (role !== Role.SUPER_ADMIN) throw new ForbiddenException('仅超级管理员可操作');
  }

  private ensureShopManager(shopRole: ShopRole) {
    if (shopRole !== ShopRole.OWNER && shopRole !== ShopRole.CLERK) {
      throw new ForbiddenException('仅店长/店员可操作');
    }
  }

  async listMyShops(userId: number) {
    const members = await this.prisma.member.findMany({
      where: { userId, isActive: true },
      include: { shop: true },
      orderBy: { id: 'desc' },
    });
    return members.map((m) => ({
      shopId: m.shopId,
      role: m.role,
      charName: m.charName,
      shop: m.shop,
      walletId: m.walletId,
    }));
  }

  async createShop(dto: CreateShopDto, user: { userId: number; role: Role }) {
    this.ensurePlatformAdmin(user.role);
    const shop = await this.prisma.shop.create({
      data: {
        name: dto.name,
        ownerId: user.userId,
        inviteCode: this.buildInviteCode(),
        currencyRules: dto.currencyRules,
      },
    });
    await this.prisma.member.create({
      data: {
        shopId: shop.id,
        userId: user.userId,
        charName: '店长',
        role: ShopRole.OWNER,
      },
    });
    return shop;
  }

  async joinShop(dto: JoinShopDto, userId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { inviteCode: dto.inviteCode } });
    if (!shop) throw new NotFoundException('邀请码无效');

    const existing = await this.prisma.member.findUnique({
      where: { shopId_userId: { shopId: shop.id, userId } },
    });
    if (existing && existing.isActive) return existing;
    if (existing && !existing.isActive) {
      return this.prisma.member.update({
        where: { id: existing.id },
        data: { isActive: true, charName: dto.charName, role: ShopRole.CUSTOMER },
      });
    }

    const created = await this.prisma.member.create({
      data: { shopId: shop.id, userId, charName: dto.charName, role: ShopRole.CUSTOMER },
    });
    this.ws.emitToShop(shop.id, { type: 'member_joined', shopId: shop.id });
    return created;
  }

  async leaveShop(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    if (member.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可退出小店');
    const updated = await this.prisma.member.update({ where: { id: member.id }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'member_left', shopId });
    return updated;
  }

  async shopSummary(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    const shop = await this.ensureShop(shopId);
    const wallets = await this.prisma.walletGroup.findMany({ where: { shopId, isActive: true } });
    const myWallet = member.walletId
      ? wallets.find((w) => w.id === member.walletId) ?? null
      : null;
    return { shop, member, wallet: myWallet, wallets };
  }

  async listMembers(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, userId: true, charName: true, role: true, balanceRaw: true, walletId: true },
      orderBy: { id: 'asc' },
    });
  }

  async listPublicMembers(shopId: number, userId: number) {
    await this.requireMember(shopId, userId);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, charName: true, role: true, walletId: true },
      orderBy: { id: 'asc' },
    });
  }

  async getInventory(shopId: number, userId: number, memberId?: number) {
    const member = await this.requireMember(shopId, userId);
    const targetId =
      member.role === ShopRole.CUSTOMER
        ? member.id
        : memberId ?? member.id;

    if (member.role !== ShopRole.CUSTOMER && memberId) {
      this.ensureShopManager(member.role);
      const target = await this.prisma.member.findFirst({ where: { id: memberId, shopId, isActive: true } });
      if (!target) throw new NotFoundException('成员不存在');
    }

    return this.prisma.inventory.findMany({
      where: { memberId: targetId },
      orderBy: { id: 'asc' },
    });
  }

  async createWallet(shopId: number, dto: CreateWalletDto, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    const wallet = await this.prisma.walletGroup.create({ data: { shopId, name: dto.name } });
    this.ws.emitToShop(shopId, { type: 'wallet_created', shopId, walletId: wallet.id });
    return wallet;
  }

  async assignWallet(shopId: number, dto: AssignWalletDto, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    const target = await this.prisma.member.findFirst({ where: { shopId, charName: dto.charName, isActive: true } });
    if (!target) throw new NotFoundException('顾客不存在');
    if (target.role !== ShopRole.CUSTOMER) throw new BadRequestException('只能给顾客分配钱包组');
    const wallet = await this.prisma.walletGroup.findFirst({ where: { id: dto.walletId, shopId, isActive: true } });
    if (!wallet) throw new NotFoundException('钱包组不存在');
    const updated = await this.prisma.member.update({ where: { id: target.id }, data: { walletId: wallet.id } });
    this.ws.emitToShop(shopId, { type: 'wallet_assigned', shopId, memberId: target.id, walletId: wallet.id });
    return updated;
  }

  async createStall(shopId: number, dto: CreateStallDto, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    await this.ensureShop(shopId);
    const stall = await this.prisma.stall.create({ data: { shopId, name: dto.name, description: dto.description } });
    this.ws.emitToShop(shopId, { type: 'stall_created', shopId, stallId: stall.id });
    return stall;
  }

  async createProduct(stallId: number, dto: CreateProductDto, userId: number) {
    const stall = await this.prisma.stall.findUnique({ where: { id: stallId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const member = await this.requireMember(stall.shopId, userId);
    this.ensureShopManager(member.role);
    const product = await this.prisma.product.create({
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
    this.ws.emitToShop(stall.shopId, { type: 'product_created', shopId: stall.shopId, stallId, productId: product.id });
    return product;
  }

  async grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    const actor = await this.requireMember(shopId, actorUserId);
    this.ensureShopManager(actor.role);
    await this.ensureShop(shopId);

    const target = await this.prisma.member.findFirst({ where: { shopId, charName: dto.charName, isActive: true } });
    if (!target) throw new NotFoundException('角色不存在');

    if (dto.target === 'wallet') {
      if (!target.walletId) throw new BadRequestException('该顾客未加入任何钱包组');
      const wallet = await this.prisma.walletGroup.update({
        where: { id: target.walletId },
        data: { balanceRaw: { increment: dto.amount } },
      });
      await this.prisma.log.create({
        data: {
          shopId,
          memberId: target.id,
          walletId: wallet.id,
          actorId: actor.id,
          type: 'grant_wallet',
          content: `钱包组加减 ${dto.amount}`,
          amount: dto.amount,
        },
      });
      this.ws.emitToShop(shopId, { type: 'wallet_balance_changed', shopId, walletId: wallet.id });
      return { wallet };
    }

    const member = await this.prisma.member.update({
      where: { id: target.id },
      data: { balanceRaw: { increment: dto.amount } },
    });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: member.id,
        actorId: actor.id,
        type: 'grant_personal',
        content: `个人余额加减 ${dto.amount}`,
        amount: dto.amount,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_balance_changed', shopId, memberId: member.id });
    return { member };
  }

  async purchase(shopId: number, dto: PurchaseDto, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可购买');
    await this.ensureShop(shopId);
    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        include: { stall: true },
      });
      if (!product || product.stall.shopId !== shopId) throw new NotFoundException('商品不存在');
      if (!product.isActive) throw new BadRequestException('商品已下架');
      if (product.isLimitStock && product.stock < dto.quantity) throw new BadRequestException('库存不足');

      const cost = product.price * dto.quantity;
      const member = await tx.member.findUnique({ where: { id: actor.id } });
      if (!member || !member.isActive) throw new BadRequestException('成员无效');
      if (member.balanceRaw < cost) throw new BadRequestException('余额不足');
      await tx.member.update({ where: { id: member.id }, data: { balanceRaw: { decrement: cost } } });

      if (product.isLimitStock) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: dto.quantity } },
        });
      }

      await tx.inventory.upsert({
        where: { memberId_name: { memberId: member.id, name: product.name } },
        update: { quantity: { increment: dto.quantity } },
        create: { memberId: member.id, productId: product.id, name: product.name, icon: product.icon, quantity: dto.quantity },
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
    this.ws.emitToShop(shopId, { type: 'purchase', shopId, memberId: result.memberId, productId: result.productId });
    this.ws.emitToShop(shopId, { type: 'member_balance_changed', shopId, memberId: result.memberId });
    this.ws.emitToShop(shopId, { type: 'product_stock_changed', shopId, productId: result.productId });
    return result;
  }

  async listStalls(shopId: number, userId: number) {
    await this.requireMember(shopId, userId);
    return this.prisma.stall.findMany({
      where: { shopId, isActive: true },
      include: { products: { where: { isActive: true } } },
      orderBy: { id: 'asc' },
    });
  }

  async listLogs(shopId: number, userId: number, limit?: number) {
    const member = await this.requireMember(shopId, userId);
    const max = Math.min(Math.max(limit ?? (member.role === ShopRole.CUSTOMER ? 10 : 50), 1), 200);
    const where =
      member.role === ShopRole.CUSTOMER ? { shopId, memberId: member.id } : { shopId };
    return this.prisma.log.findMany({ where, orderBy: { createdAt: 'desc' }, take: max });
  }

  private buildInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async ensureShop(shopId: number) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('店铺不存在');
    return shop;
  }

  private async requireMember(shopId: number, userId: number) {
    const member = await this.prisma.member.findUnique({ where: { shopId_userId: { shopId, userId } } });
    if (!member || !member.isActive) throw new ForbiddenException('未加入该小店');
    return member;
  }
}
