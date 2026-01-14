import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InviteCleanup implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    setInterval(async () => {
      try {
        const now = new Date();
        await this.prisma.inviteCode.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { isActive: false }],
          },
        });
      } catch {
        // ignore
      }
    }, 60_000).unref();
  }
}
