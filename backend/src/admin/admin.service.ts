import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';
import { Role } from '@prisma/client';

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
}

