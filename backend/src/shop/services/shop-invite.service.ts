import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { CreateInviteDto } from '../dto/create-invite.dto';
import { ShopContextService } from './shop-context.service';

@Injectable()
export class ShopInviteService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async createInvite(shopId: number, userId: number, dto: CreateInviteDto) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
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
        if (err?.code === 'P2002') continue;
        throw err;
      }
    }
    if (!invite) throw new BadRequestException('生成邀请码失败，请重试');
    this.ws.emitToShop(shopId, { type: 'invite_created', shopId });
    return invite;
  }

  async listInvites(shopId: number, userId: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const now = new Date();
    return this.prisma.inviteCode.findMany({
      where: { shopId, expiresAt: { gt: now }, isActive: true },
      orderBy: { id: 'desc' },
    });
  }

  async deleteInvite(shopId: number, inviteId: number, userId: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const invite = await this.prisma.inviteCode.findFirst({ where: { id: inviteId, shopId } });
    if (!invite) throw new NotFoundException('邀请码不存在');
    await this.prisma.inviteCode.update({ where: { id: invite.id }, data: { isActive: false } });
    this.ws.emitToShop(shopId, { type: 'invite_deleted', shopId });
    return { ok: true };
  }

  private buildInviteCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}

