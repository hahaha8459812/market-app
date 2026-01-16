import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShopContextService } from './shop-context.service';
import { ShopRole, WalletMode } from '@prisma/client';

@Injectable()
export class ShopLogService {
  constructor(
    private prisma: PrismaService,
    private ctx: ShopContextService,
  ) {}

  async listLogs(shopId: number, userId: number, limit?: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    const shop = await this.ctx.ensureShop(shopId);

    const isCustomerTeamShared = member.role === ShopRole.CUSTOMER && shop.walletMode === WalletMode.TEAM;
    const defaultLimit = member.role === ShopRole.CUSTOMER ? (isCustomerTeamShared ? 200 : 10) : 50;
    const max = Math.min(Math.max(limit ?? defaultLimit, 1), 200);

    const where =
      member.role === ShopRole.CUSTOMER
        ? isCustomerTeamShared
          ? { shopId }
          : { shopId, memberId: member.id }
        : { shopId };
    const logs = await this.prisma.log.findMany({ where, orderBy: { createdAt: 'desc' }, take: max });
    const ids = new Set<number>();
    for (const row of logs) {
      if (row.actorId) ids.add(row.actorId);
      if (row.memberId) ids.add(row.memberId);
    }
    if (ids.size === 0) return logs;
    const members = await this.prisma.member.findMany({
      where: { shopId, id: { in: Array.from(ids) } },
      select: { id: true, charName: true, role: true },
    });
    const byId = new Map(members.map((m) => [m.id, m]));
    return logs.map((row: any) => ({
      ...row,
      actorName: row.actorId ? byId.get(row.actorId)?.charName ?? null : null,
      actorRole: row.actorId ? byId.get(row.actorId)?.role ?? null : null,
      memberName: row.memberId ? byId.get(row.memberId)?.charName ?? null : null,
      memberRole: row.memberId ? byId.get(row.memberId)?.role ?? null : null,
    }));
  }
}
