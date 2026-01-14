import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig, AppConfigService } from '../app-config/app-config.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { writeFileSync } from 'node:fs';
import { stringify } from '@iarna/toml';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private appConfig: AppConfigService) {}

  ensureSuperAdmin(role: Role) {
    if (role !== Role.SUPER_ADMIN) throw new ForbiddenException('仅超级管理员可操作');
  }

  async getStats() {
    const [users, shops, members] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.shop.count(),
      this.prisma.member.count({ where: { isActive: true } }),
    ]);
    return { users, shops, activeMembers: members };
  }

  getConfigPreview() {
    const ws = this.appConfig.getWsConfig();
    const features = this.appConfig.getFeatures();
    const superAdmin = this.appConfig.getSuperAdmin();
    return {
      super_admin: { username: superAdmin.username },
      features: features,
      ws: ws,
      note: '配置来自 config.toml（容器内通常以只读方式挂载），请在服务器上编辑后重启容器生效。',
    };
  }

  async updateConfig(patch: { allow_register?: boolean; ws_ping_interval_ms?: number }) {
    const current = this.appConfig.getRawConfig();
    const next: AppConfig = {
      ...current,
      features: {
        ...(current.features ?? {}),
        ...(patch.allow_register === undefined ? {} : { allow_register: patch.allow_register }),
      },
      ws: {
        ...(current.ws ?? {}),
        ...(patch.ws_ping_interval_ms === undefined ? {} : { ping_interval_ms: patch.ws_ping_interval_ms }),
      },
    };

    // Do NOT allow changing super_admin via API (kept in config file explicitly)
    next.super_admin = current.super_admin;

    const path = this.appConfig.getConfigPath();
    try {
      writeFileSync(path, stringify(next), 'utf-8');
    } catch {
      throw new BadRequestException('无法写入 config.toml（可能是只读挂载），请改为可写并重启');
    }

    return { ok: true, path };
  }

  async listUsers() {
    return this.prisma.user.findMany({
      where: { role: Role.PLAYER },
      select: { id: true, username: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  async createUser(payload: { username: string; password: string }) {
    const reserved = this.appConfig.getSuperAdmin().username;
    if (payload.username === reserved) throw new BadRequestException('该用户名已保留');

    const exists = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (exists) throw new BadRequestException('用户名已存在');

    const passwordHash = await bcrypt.hash(payload.password, 10);
    return this.prisma.user.create({
      data: { username: payload.username, passwordHash, role: Role.PLAYER },
      select: { id: true, username: true, createdAt: true },
    });
  }

  async deleteUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');
    if (user.role !== Role.PLAYER) throw new BadRequestException('不能删除该账号');

    await this.prisma.$transaction(async (tx) => {
      const ownedShops = await tx.shop.findMany({ where: { ownerId: userId }, select: { id: true } });
      const ownedShopIds = ownedShops.map((s) => s.id);

      const members = await tx.member.findMany({ where: { userId }, select: { id: true } });
      const memberIds = members.map((m) => m.id);

      // remove logs referencing members first (FK)
      if (ownedShopIds.length) {
        await tx.log.deleteMany({ where: { shopId: { in: ownedShopIds } } });
      }
      if (memberIds.length) {
        await tx.log.deleteMany({ where: { memberId: { in: memberIds } } });
      }

      await tx.inventory.deleteMany({ where: { member: { userId } } });
      await tx.member.deleteMany({ where: { userId } });

      if (ownedShopIds.length) {
        await tx.product.deleteMany({ where: { stall: { shopId: { in: ownedShopIds } } } });
        await tx.stall.deleteMany({ where: { shopId: { in: ownedShopIds } } });
        await tx.walletGroup.deleteMany({ where: { shopId: { in: ownedShopIds } } });
        await tx.shop.deleteMany({ where: { id: { in: ownedShopIds } } });
      }

      await tx.log.updateMany({ where: { actorId: userId }, data: { actorId: null } });
      await tx.user.delete({ where: { id: userId } });
    });
    return { ok: true };
  }

  async userDetail(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.PLAYER) throw new NotFoundException('账号不存在');
    const members = await this.prisma.member.findMany({
      where: { userId, isActive: true },
      include: { shop: true },
      orderBy: { id: 'asc' },
    });
    return {
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      asOwner: members.filter((m) => m.role === 'OWNER' || m.role === 'CLERK').map((m) => ({ shopId: m.shopId, shopName: m.shop.name, role: m.role })),
      asCustomer: members.filter((m) => m.role === 'CUSTOMER').map((m) => ({ shopId: m.shopId, shopName: m.shop.name, role: m.role })),
    };
  }
}
