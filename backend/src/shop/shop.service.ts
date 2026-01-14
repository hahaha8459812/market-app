import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { Role, ShopRole, WalletMode } from '@prisma/client';
import { WsService } from '../ws/ws.service';

@Injectable()
export class ShopService {
  constructor(private prisma: PrismaService, private ws: WsService) {}

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
    }));
  }

  async createShop(dto: CreateShopDto, user: { userId: number; role: Role }) {
    if (user.role !== Role.PLAYER) throw new ForbiddenException('该账号不能创建小店');
    const shop = await this.prisma.shop.create({
      data: {
        name: dto.name,
        ownerId: user.userId,
        currencyRules:
          dto.currencyRules ??
          ({
            main: '金',
            rates: { 金: 1, 银: 10, 铜: 100 },
          } as any),
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

  async updateShop(shopId: number, userId: number, dto: { name?: string; currencyRules?: any }) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    const updated = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        name: dto.name,
        currencyRules: dto.currencyRules,
      },
    });
    this.ws.emitToShop(shopId, { type: 'shop_updated', shopId });
    return updated;
  }

  async joinShop(dto: JoinShopDto, userId: number) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } });
    if (!invite || !invite.isActive || invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('邀请码无效或已过期');
    }
    const shop = await this.prisma.shop.findUnique({ where: { id: invite.shopId } });
    if (!shop) throw new NotFoundException('小店不存在');

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
    return { shop, member };
  }

  async createInvite(shopId: number, userId: number, dto: CreateInviteDto) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const ttl = Math.min(Math.max(dto.ttlMinutes ?? 10, 1), 60);
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    let invite: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.buildInviteCode();
      try {
        invite = await this.prisma.inviteCode.create({
          data: { shopId, code, expiresAt, createdBy: actor.id },
        });
        break;
      } catch (err: any) {
        // P2002: Unique constraint failed
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
    if (!invite) throw new BadRequestException('生成邀请码失败，请重试');
    this.ws.emitToShop(shopId, { type: 'invite_created', shopId });
    return invite;
  }

  async listInvites(shopId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const now = new Date();
    return this.prisma.inviteCode.findMany({
      where: { shopId, isActive: true, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async deleteInvite(shopId: number, inviteId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const invite = await this.prisma.inviteCode.findFirst({ where: { id: inviteId, shopId } });
    if (!invite) throw new NotFoundException('邀请码不存在');
    await this.prisma.inviteCode.update({ where: { id: inviteId }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'invite_deleted', shopId });
    return { ok: true };
  }

  async listMembers(shopId: number, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, userId: true, charName: true, role: true, balanceRaw: true },
      orderBy: { id: 'asc' },
    });
  }

  async setMemberRole(shopId: number, userId: number, targetMemberId: number, role: ShopRole) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可任命/撤销店员');
    const target = await this.prisma.member.findFirst({ where: { id: targetMemberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role === ShopRole.OWNER) throw new BadRequestException('不能修改店长身份');

    const updated = await this.prisma.member.update({ where: { id: target.id }, data: { role } });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: updated.id,
        actorId: actor.id,
        type: 'member_role',
        content: `设置身份为 ${role}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_role_changed', shopId, memberId: updated.id, role });
    return updated;
  }

  async deleteShop(shopId: number, userId: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可注销小店');

    await this.prisma.$transaction(async (tx) => {
      await tx.log.deleteMany({ where: { shopId } });
      await tx.inventory.deleteMany({ where: { member: { shopId } } });
      await tx.member.deleteMany({ where: { shopId } });
      await tx.product.deleteMany({ where: { stall: { shopId } } });
      await tx.stall.deleteMany({ where: { shopId } });
      await tx.inviteCode.deleteMany({ where: { shopId } });
      await tx.shop.delete({ where: { id: shopId } });
    });

    this.ws.emitToShop(shopId, { type: 'shop_deleted', shopId });
    return { ok: true };
  }

  async listPublicMembers(shopId: number, userId: number) {
    await this.requireMember(shopId, userId);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, charName: true, role: true },
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

  async adjustInventory(shopId: number, userId: number, payload: { memberId: number; name: string; icon?: string; extraDesc?: string; quantityDelta: number }) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const target = await this.prisma.member.findFirst({ where: { id: payload.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');

    const inv = await this.prisma.inventory.findUnique({ where: { memberId_name: { memberId: target.id, name: payload.name } } });
    const nextQty = (inv?.quantity ?? 0) + payload.quantityDelta;
    if (nextQty <= 0) {
      if (inv) {
        await this.prisma.inventory.delete({ where: { id: inv.id } });
      }
    } else if (inv) {
      await this.prisma.inventory.update({
        where: { id: inv.id },
        data: { quantity: nextQty, icon: payload.icon ?? inv.icon, extraDesc: payload.extraDesc ?? inv.extraDesc },
      });
    } else {
      await this.prisma.inventory.create({
        data: { memberId: target.id, name: payload.name, icon: payload.icon, extraDesc: payload.extraDesc, quantity: nextQty },
      });
    }

    await this.prisma.log.create({
      data: {
        shopId,
        memberId: target.id,
        actorId: actor.id,
        type: 'inventory_adjust',
        content: `背包 ${payload.name} 数量变更 ${payload.quantityDelta}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'inventory_changed', shopId, memberId: target.id });
    return { ok: true };
  }

  async createStall(shopId: number, dto: CreateStallDto, userId: number) {
    const member = await this.requireMember(shopId, userId);
    this.ensureShopManager(member.role);
    await this.ensureShop(shopId);
    const stall = await this.prisma.stall.create({ data: { shopId, name: dto.name, description: dto.description } });
    this.ws.emitToShop(shopId, { type: 'stall_created', shopId, stallId: stall.id });
    return stall;
  }

  async updateStall(shopId: number, stallId: number, userId: number, dto: { name?: string; description?: string; isActive?: boolean }) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const stall = await this.prisma.stall.findFirst({ where: { id: stallId, shopId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const updated = await this.prisma.stall.update({ where: { id: stallId }, data: dto });
    await this.prisma.log.create({
      data: { shopId, actorId: actor.id, type: 'stall_update', content: `修改摊位 ${stallId}`, amount: 0 },
    });
    this.ws.emitToShop(shopId, { type: 'stall_updated', shopId, stallId });
    return updated;
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

  async updateProduct(shopId: number, productId: number, userId: number, dto: any) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const product = await this.prisma.product.findFirst({ where: { id: productId, stall: { shopId } }, include: { stall: true } });
    if (!product) throw new NotFoundException('商品不存在');
    const updated = await this.prisma.product.update({ where: { id: productId }, data: dto });
    await this.prisma.log.create({
      data: { shopId, actorId: actor.id, type: 'product_update', content: `修改商品 ${productId}`, amount: 0 },
    });
    this.ws.emitToShop(shopId, { type: 'product_updated', shopId, stallId: product.stallId, productId });
    return updated;
  }

  async grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    const actor = await this.requireMember(shopId, actorUserId);
    this.ensureShopManager(actor.role);
    const shop = await this.ensureShop(shopId);

    const target = await this.prisma.member.findFirst({ where: { id: dto.memberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('角色不存在');

    if (dto.target === 'team') {
      if (shop.walletMode !== WalletMode.TEAM) throw new BadRequestException('当前不是全队钱包模式');
      const updatedShop = await this.prisma.shop.update({
        where: { id: shopId },
        data: { teamBalanceRaw: { increment: dto.amount } },
      });
      if (updatedShop.teamBalanceRaw < 0) throw new BadRequestException('队伍余额不足');
      await this.prisma.log.create({
        data: {
          shopId,
          memberId: target.id,
          actorId: actor.id,
          type: 'grant_team',
          content: `队伍余额加减 ${dto.amount}`,
          amount: dto.amount,
        },
      });
      this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
      return { shop: updatedShop };
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

      const shop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!shop) throw new NotFoundException('店铺不存在');

      let chargedTeam = false;
      if (shop.walletMode === WalletMode.TEAM) {
        if (shop.teamBalanceRaw < cost) throw new BadRequestException('队伍余额不足');
        await tx.shop.update({ where: { id: shopId }, data: { teamBalanceRaw: { decrement: cost } } });
        chargedTeam = true;
      } else {
        if (member.balanceRaw < cost) throw new BadRequestException('个人余额不足');
        await tx.member.update({ where: { id: member.id }, data: { balanceRaw: { decrement: cost } } });
      }

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

      return { cost, memberId: member.id, productId: product.id, chargedTeam };
    });
    this.ws.emitToShop(shopId, { type: 'purchase', shopId, memberId: result.memberId, productId: result.productId });
    this.ws.emitToShop(shopId, { type: 'member_balance_changed', shopId, memberId: result.memberId });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
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

  async setCustomerAdjustSwitches(shopId: number, userId: number, allowInc?: boolean, allowDec?: boolean) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
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

  async selfAdjustBalance(shopId: number, userId: number, amount: number) {
    const actor = await this.requireMember(shopId, userId);
    if (actor.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可操作');
    const shop = await this.ensureShop(shopId);

    if (amount > 0 && !shop.allowCustomerInc) throw new ForbiddenException('当前不允许顾客自增余额');
    if (amount < 0 && !shop.allowCustomerDec) throw new ForbiddenException('当前不允许顾客自减余额');
    if (amount === 0) return { ok: true };

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({ where: { id: actor.id } });
      if (!member) throw new NotFoundException('成员不存在');

      const currentShop = await tx.shop.findUnique({ where: { id: shopId } });
      if (!currentShop) throw new NotFoundException('店铺不存在');

      if (currentShop.walletMode === WalletMode.TEAM) {
        const next = currentShop.teamBalanceRaw + amount;
        if (next < 0) throw new BadRequestException('队伍余额不足');
        const updatedShop = await tx.shop.update({ where: { id: shopId }, data: { teamBalanceRaw: next } });
        await tx.log.create({
          data: {
            shopId,
            memberId: member.id,
            actorId: member.id,
            type: 'self_adjust_team',
            content: `顾客自助调整队伍余额 ${amount}`,
            amount,
          },
        });
        return { shop: updatedShop };
      }

      const next = member.balanceRaw + amount;
      if (next < 0) throw new BadRequestException('个人余额不足');
      const m = await tx.member.update({ where: { id: member.id }, data: { balanceRaw: next } });
      await tx.log.create({
        data: {
          shopId,
          memberId: m.id,
          actorId: m.id,
          type: 'self_adjust_personal',
          content: `顾客自助调整个人余额 ${amount}`,
          amount,
        },
      });
      return { member: m };
    }).then((res) => {
      this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
      return res;
    });
  }

  async switchWalletMode(shopId: number, userId: number, mode: WalletMode) {
    const actor = await this.requireMember(shopId, userId);
    this.ensureShopManager(actor.role);
    const shop = await this.ensureShop(shopId);
    if (shop.walletMode === mode) return shop;

    const updated = await this.prisma.$transaction(async (tx) => {
      const customers = await tx.member.findMany({
        where: { shopId, isActive: true, role: ShopRole.CUSTOMER },
        orderBy: { id: 'asc' },
      });
      if (!customers.length) throw new BadRequestException('当前小店没有顾客');

      if (mode === WalletMode.TEAM) {
        const sum = customers.reduce((acc, m) => acc + m.balanceRaw, 0);
        await tx.member.updateMany({ where: { id: { in: customers.map((m) => m.id) } }, data: { balanceRaw: 0 } });
        return tx.shop.update({ where: { id: shopId }, data: { walletMode: WalletMode.TEAM, teamBalanceRaw: sum } });
      }

      const total = shop.teamBalanceRaw;
      const n = customers.length;
      const base = Math.floor(total / n);
      const rem = total % n;
      const receiver = customers[customers.length - 1];

      for (const m of customers) {
        const add = m.id === receiver.id ? base + rem : base;
        await tx.member.update({ where: { id: m.id }, data: { balanceRaw: add } });
      }

      return tx.shop.update({ where: { id: shopId }, data: { walletMode: WalletMode.PERSONAL, teamBalanceRaw: 0 } });
    });

    await this.prisma.log.create({
      data: {
        shopId,
        actorId: actor.id,
        type: 'wallet_mode',
        content: `钱包模式切换为 ${mode}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'wallet_mode_changed', shopId, mode });
    this.ws.emitToShop(shopId, { type: 'balances_changed', shopId });
    return updated;
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
