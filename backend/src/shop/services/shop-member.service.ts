import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { JoinShopDto } from '../dto/join-shop.dto';
import { ShopContextService } from './shop-context.service';
import { ShopRole } from '@prisma/client';

@Injectable()
export class ShopMemberService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

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

  async joinShop(dto: JoinShopDto, userId: number) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } });
    if (!invite || !invite.isActive || invite.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('邀请码无效或已过期');
    }
    const shop = await this.prisma.shop.findUnique({ where: { id: invite.shopId } });
    if (!shop) throw new NotFoundException('小店不存在');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const charName = user.username;

    const existing = await this.prisma.member.findUnique({
      where: { shopId_userId: { shopId: shop.id, userId } },
    });
    if (existing && existing.isActive) return existing;
    if (existing && !existing.isActive) {
      return this.prisma.member.update({
        where: { id: existing.id },
        data: { isActive: true, charName, role: ShopRole.CUSTOMER },
      });
    }

    const created = await this.prisma.member.create({
      data: { shopId: shop.id, userId, charName, role: ShopRole.CUSTOMER },
    });
    this.ws.emitToShop(shop.id, { type: 'member_joined', shopId: shop.id });
    return created;
  }

  async updateMyCharName(shopId: number, userId: number, charNameRaw: string) {
    const member = await this.ctx.requireMember(shopId, userId);
    const shop = await this.ctx.ensureShop(shopId);
    if (shop.isSwitching) throw new BadRequestException('钱包模式切换中，请稍后再试');
    const charName = (charNameRaw ?? '').trim();
    if (!charName) throw new BadRequestException('角色名不能为空');

    const updated = await this.prisma.member.update({ where: { id: member.id }, data: { charName } });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: member.id,
        actorId: member.id,
        type: 'char_name',
        content: `修改角色名为 ${charName}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_updated', shopId, memberId: member.id });
    return updated;
  }

  async leaveShop(shopId: number, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    if (member.role !== ShopRole.CUSTOMER) throw new ForbiddenException('仅顾客可退出小店');
    const updated = await this.prisma.member.update({ where: { id: member.id }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'member_left', shopId });
    return updated;
  }

  async listMembers(shopId: number, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(member.role);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, userId: true, charName: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  async listPublicMembers(shopId: number, userId: number) {
    await this.ctx.requireMember(shopId, userId);
    return this.prisma.member.findMany({
      where: { shopId, isActive: true },
      select: { id: true, charName: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  async setMemberRole(shopId: number, userId: number, targetMemberId: number, role: ShopRole) {
    const actor = await this.ctx.requireMember(shopId, userId);
    if (actor.role !== ShopRole.OWNER) throw new ForbiddenException('仅店长可任命/撤销店员');
    const target = await this.prisma.member.findFirst({ where: { id: targetMemberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role === ShopRole.OWNER) throw new BadRequestException('不能修改店长');
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

  async kickMember(shopId: number, actorUserId: number, targetMemberId: number) {
    const actor = await this.ctx.requireMember(shopId, actorUserId);
    this.ctx.ensureShopManager(actor.role);
    if (actor.id === targetMemberId) throw new BadRequestException('不能踢出自己');
    const target = await this.prisma.member.findFirst({ where: { id: targetMemberId, shopId, isActive: true } });
    if (!target) throw new NotFoundException('成员不存在');
    if (target.role === ShopRole.OWNER) throw new BadRequestException('不能踢出店长');
    if (actor.role === ShopRole.CLERK && target.role !== ShopRole.CUSTOMER) {
      throw new ForbiddenException('店员只能踢出顾客');
    }
    const updated = await this.prisma.member.update({ where: { id: target.id }, data: { isActive: false } });
    await this.prisma.log.create({
      data: {
        shopId,
        memberId: target.id,
        actorId: actor.id,
        type: 'member_kick',
        content: `踢出成员 ${target.id}`,
        amount: 0,
      },
    });
    this.ws.emitToShop(shopId, { type: 'member_kicked', shopId, memberId: target.id });
    return updated;
  }
}
