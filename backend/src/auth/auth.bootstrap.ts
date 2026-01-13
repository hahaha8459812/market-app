import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthBootstrap implements OnModuleInit {
  constructor(private authService: AuthService) {}

  async onModuleInit() {
    await this.authService.ensureSuperAdminFromConfig();
  }
}

