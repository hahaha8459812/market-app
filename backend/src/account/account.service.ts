import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangeUsernameDto } from './dto/change-username.dto';

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService, private appConfig: AppConfigService) {}

  async changeUsername(userId: number, dto: ChangeUsernameDto) {
    const reserved = this.appConfig.getSuperAdmin().username;
    if (dto.username === reserved) throw new BadRequestException('该用户名已保留');

    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException('用户名已存在');

    const user = await this.prisma.user.update({ where: { id: userId }, data: { username: dto.username } });
    return { id: user.id, username: user.username, role: user.role };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('当前密码错误');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }
}

