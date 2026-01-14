import { Body, Controller, Patch, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountService } from './account.service';
import { ChangeUsernameDto } from './dto/change-username.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Patch('username')
  changeUsername(@Body() dto: ChangeUsernameDto, @Request() req: any) {
    return this.accountService.changeUsername(req.user.userId, dto);
  }

  @Patch('password')
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.accountService.changePassword(req.user.userId, dto);
  }
}

