import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateConfigDto } from './dto/update-config.dto';

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

  @Patch('config')
  updateConfig(@Body() dto: UpdateConfigDto, @Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.updateConfig(dto);
  }

  @Get('users')
  users(@Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.listUsers();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto, @Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.createUser(dto);
  }

  @Get('users/:id')
  userDetail(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.userDetail(id);
  }

  @Delete('users/:id')
  deleteUser(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    this.adminService.ensureSuperAdmin(req.user.role);
    return this.adminService.deleteUser(id);
  }
}
