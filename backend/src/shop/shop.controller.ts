import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { SetMemberRoleDto } from './dto/set-member-role.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ShopRole } from '@prisma/client';
import { SelfAdjustDto } from './dto/self-adjust.dto';
import { UpdateCustomerAdjustDto } from './dto/update-customer-adjust.dto';
import { SwitchWalletModeDto } from './dto/switch-wallet-mode.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { DeleteCurrencyDto } from './dto/delete-currency.dto';
import { SelfInventoryAdjustDto } from './dto/self-inventory.dto';
import { ShopStatsQueryDto } from './dto/shop-stats.dto';

@UseGuards(JwtAuthGuard)
@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  private ensureNotSuperAdmin(req: any) {
    if (req.user?.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('超级管理员不可使用小店功能');
    }
  }

  @Get()
  list(@Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listMyShops(req.user.userId);
  }

  @Post('join')
  join(@Body() dto: JoinShopDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.joinShop(dto, req.user.userId);
  }

  @Post()
  createShop(@Body() dto: CreateShopDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.createShop(dto, req.user);
  }

  @Patch(':shopId')
  updateShop(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: UpdateShopDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.updateShop(shopId, req.user.userId, dto);
  }

  @Delete(':shopId')
  deleteShop(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.deleteShop(shopId, req.user.userId);
  }

  @Delete(':shopId/leave')
  leave(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.leaveShop(shopId, req.user.userId);
  }

  @Get(':shopId/summary')
  summary(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.shopSummary(shopId, req.user.userId);
  }

  @Get(':shopId/stalls')
  stalls(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listStalls(shopId, req.user.userId);
  }

  @Get(':shopId/members')
  members(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listMembers(shopId, req.user.userId);
  }

  @Post(':shopId/set-member-role')
  setMemberRole(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: SetMemberRoleDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.setMemberRole(shopId, req.user.userId, dto.memberId, dto.role as ShopRole);
  }

  @Get(':shopId/public-members')
  publicMembers(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listPublicMembers(shopId, req.user.userId);
  }

  @Get(':shopId/inventory')
  inventory(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query() query: InventoryQueryDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.getInventory(shopId, req.user.userId, query.memberId);
  }

  @Post(':shopId/inventory/adjust')
  adjustInventory(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: AdjustInventoryDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.adjustInventory(shopId, req.user.userId, dto);
  }

  @Post(':shopId/invites')
  createInvite(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: CreateInviteDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.createInvite(shopId, req.user.userId, dto);
  }

  @Get(':shopId/invites')
  listInvites(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listInvites(shopId, req.user.userId);
  }

  @Delete(':shopId/invites/:inviteId')
  deleteInvite(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.deleteInvite(shopId, inviteId, req.user.userId);
  }

  @Post(':shopId/wallet-mode')
  switchWalletMode(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: SwitchWalletModeDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.switchWalletMode(shopId, req.user.userId, dto.mode as any);
  }

  @Patch(':shopId/customer-adjust')
  customerAdjustSwitches(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: UpdateCustomerAdjustDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.setCustomerAdjustSwitches(shopId, req.user.userId, dto.allowCustomerInc, dto.allowCustomerDec);
  }

  @Post(':shopId/self-adjust')
  selfAdjust(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: SelfAdjustDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.selfAdjustBalance(shopId, req.user.userId, dto.currencyId, dto.amount);
  }

  @Post(':shopId/inventory/self-adjust')
  selfInventoryAdjust(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: SelfInventoryAdjustDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.selfAdjustInventory(shopId, req.user.userId, dto);
  }

  @Get(':shopId/currencies')
  listCurrencies(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.listCurrencies(shopId, req.user.userId);
  }

  @Post(':shopId/currencies')
  createCurrency(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: CreateCurrencyDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.createCurrency(shopId, req.user.userId, dto);
  }

  @Patch(':shopId/currencies/:currencyId')
  updateCurrency(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('currencyId', ParseIntPipe) currencyId: number,
    @Body() dto: UpdateCurrencyDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.updateCurrency(shopId, req.user.userId, currencyId, dto);
  }

  @Delete(':shopId/currencies/:currencyId')
  deleteCurrency(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('currencyId', ParseIntPipe) currencyId: number,
    @Body() dto: DeleteCurrencyDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.deleteCurrency(shopId, req.user.userId, currencyId, dto);
  }

  @Post(':shopId/stalls')
  createStall(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: CreateStallDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.createStall(shopId, dto, req.user.userId);
  }

  @Patch(':shopId/stalls/:stallId')
  updateStall(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: UpdateStallDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.updateStall(shopId, stallId, req.user.userId, dto);
  }

  @Post('stalls/:stallId/products')
  createProduct(
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: CreateProductDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.createProduct(stallId, dto, req.user.userId);
  }

  @Patch(':shopId/products/:productId')
  updateProduct(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateProductDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.updateProduct(shopId, productId, req.user.userId, dto);
  }

  @Post(':shopId/grant-balance')
  grantBalance(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: GrantBalanceDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.grantBalance(shopId, dto, req.user.userId);
  }

  @Post(':shopId/purchase')
  purchase(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: PurchaseDto,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.purchase(shopId, dto, req.user.userId);
  }

  @Get(':shopId/logs')
  logs(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('limit') limit: string | undefined,
    @Request() req: any,
  ) {
    this.ensureNotSuperAdmin(req);
    const n = limit ? Number(limit) : undefined;
    return this.shopService.listLogs(shopId, req.user.userId, Number.isFinite(n as any) ? n : undefined);
  }

  @Get(':shopId/stats')
  stats(@Param('shopId', ParseIntPipe) shopId: number, @Query() query: ShopStatsQueryDto, @Request() req: any) {
    this.ensureNotSuperAdmin(req);
    return this.shopService.getShopStats(shopId, req.user.userId, query.include);
  }
}
