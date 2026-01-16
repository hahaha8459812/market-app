import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShopContextService } from './shop-context.service';
import { AppConfigService } from '../../app-config/app-config.service';

@Injectable()
export class ShopLogService {
  constructor(
    private prisma: PrismaService,
    private ctx: ShopContextService,
    private appConfig: AppConfigService,
  ) {}

  async listLogs(shopId: number, userId: number, limit?: number) {
    await this.ctx.requireMember(shopId, userId);
    const sharedLimit = this.appConfig.getLogConfig().sharedLimit;
    const max = Math.min(Math.max(limit ?? sharedLimit, 1), sharedLimit);

    // 透明审计：同一小店内所有成员共享同一份日志（只按 shopId 过滤）
    const where = { shopId };
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
