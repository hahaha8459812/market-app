import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async getPlatformStats() {
    const [users, shops, activeMembers, stalls, products, currencies] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.shop.count(),
      this.prisma.member.count({ where: { isActive: true } }),
      this.prisma.stall.count(),
      this.prisma.product.count(),
      this.prisma.currency.count(),
    ]);
    return { users, shops, activeMembers, stalls, products, currencies };
  }
}

