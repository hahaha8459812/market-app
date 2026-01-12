import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SetupAdminDto } from './dto/setup-admin.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async setupSuperAdmin(payload: SetupAdminDto) {
    const existing = await this.prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } });
    if (existing) {
      throw new BadRequestException('超级管理员已存在');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.prisma.user.create({
      data: { username: payload.username, passwordHash, role: Role.SUPER_ADMIN },
    });
    return this.buildToken(user.id, user.username, user.role);
  }

  async login(payload: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const ok = await bcrypt.compare(payload.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('用户名或密码错误');
    return this.buildToken(user.id, user.username, user.role);
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, username: user.username, role: user.role };
  }

  private buildToken(userId: number, username: string, role: Role) {
    const payload = { sub: userId, username, role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: userId, username, role },
    };
  }
}
