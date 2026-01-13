import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Role } from '@prisma/client';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private appConfig: AppConfigService,
  ) {}

  async ensureSuperAdminFromConfig() {
    const desired = this.appConfig.getSuperAdmin();
    const existing = await this.prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } });
    const passwordHash = await bcrypt.hash(desired.password, 10);

    if (!existing) {
      await this.prisma.user.create({
        data: { username: desired.username, passwordHash, role: Role.SUPER_ADMIN },
      });
      return;
    }

    const needsPasswordUpdate = !(await bcrypt.compare(desired.password, existing.passwordHash));
    const needsUsernameUpdate = existing.username !== desired.username;
    if (!needsPasswordUpdate && !needsUsernameUpdate) return;

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        username: desired.username,
        passwordHash: needsPasswordUpdate ? passwordHash : existing.passwordHash,
      },
    });
  }

  async login(payload: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const ok = await bcrypt.compare(payload.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('用户名或密码错误');
    return this.buildToken(user.id, user.username, user.role);
  }

  async register(payload: RegisterDto) {
    const { allowRegister } = this.appConfig.getFeatures();
    if (!allowRegister) throw new BadRequestException('当前不允许注册');

    const exists = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (exists) throw new BadRequestException('用户名已存在');

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.prisma.user.create({
      data: { username: payload.username, passwordHash, role: Role.PLAYER },
    });
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
