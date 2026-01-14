import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async stats(@Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.getStats();
  }

  @Get('config')
  config(@Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.getConfigPreview();
  }
}

