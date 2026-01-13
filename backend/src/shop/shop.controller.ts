import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { AssignWalletDto } from './dto/assign-wallet.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { SetMemberRoleDto } from './dto/set-member-role.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ShopRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  list(@Request() req: any) {
    return this.shopService.listMyShops(req.user.userId);
  }

  @Post('join')
  join(@Body() dto: JoinShopDto, @Request() req: any) {
    return this.shopService.joinShop(dto, req.user.userId);
  }

  @Post()
  createShop(@Body() dto: CreateShopDto, @Request() req: any) {
    return this.shopService.createShop(dto, req.user);
  }

  @Patch(':shopId')
  updateShop(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: UpdateShopDto, @Request() req: any) {
    return this.shopService.updateShop(shopId, req.user.userId, dto);
  }

  @Delete(':shopId')
  deleteShop(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.deleteShop(shopId, req.user.userId);
  }

  @Delete(':shopId/leave')
  leave(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.leaveShop(shopId, req.user.userId);
  }

  @Get(':shopId/summary')
  summary(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.shopSummary(shopId, req.user.userId);
  }

  @Get(':shopId/stalls')
  stalls(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.listStalls(shopId, req.user.userId);
  }

  @Get(':shopId/members')
  members(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.listMembers(shopId, req.user.userId);
  }

  @Post(':shopId/set-member-role')
  setMemberRole(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: SetMemberRoleDto, @Request() req: any) {
    return this.shopService.setMemberRole(shopId, req.user.userId, dto.memberId, dto.role as ShopRole);
  }

  @Get(':shopId/public-members')
  publicMembers(@Param('shopId', ParseIntPipe) shopId: number, @Request() req: any) {
    return this.shopService.listPublicMembers(shopId, req.user.userId);
  }

  @Get(':shopId/inventory')
  inventory(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query() query: InventoryQueryDto,
    @Request() req: any,
  ) {
    return this.shopService.getInventory(shopId, req.user.userId, query.memberId);
  }

  @Post(':shopId/inventory/adjust')
  adjustInventory(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: AdjustInventoryDto, @Request() req: any) {
    return this.shopService.adjustInventory(shopId, req.user.userId, dto);
  }

  @Post(':shopId/wallet-groups')
  createWallet(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: CreateWalletDto, @Request() req: any) {
    return this.shopService.createWallet(shopId, dto, req.user.userId);
  }

  @Post(':shopId/assign-wallet')
  assignWallet(@Param('shopId', ParseIntPipe) shopId: number, @Body() dto: AssignWalletDto, @Request() req: any) {
    return this.shopService.assignWallet(shopId, dto, req.user.userId);
  }

  @Post(':shopId/stalls')
  createStall(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: CreateStallDto,
    @Request() req: any,
  ) {
    return this.shopService.createStall(shopId, dto, req.user.userId);
  }

  @Patch(':shopId/stalls/:stallId')
  updateStall(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: UpdateStallDto,
    @Request() req: any,
  ) {
    return this.shopService.updateStall(shopId, stallId, req.user.userId, dto);
  }

  @Post('stalls/:stallId/products')
  createProduct(
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: CreateProductDto,
    @Request() req: any,
  ) {
    return this.shopService.createProduct(stallId, dto, req.user.userId);
  }

  @Patch(':shopId/products/:productId')
  updateProduct(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateProductDto,
    @Request() req: any,
  ) {
    return this.shopService.updateProduct(shopId, productId, req.user.userId, dto);
  }

  @Post(':shopId/grant-balance')
  grantBalance(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: GrantBalanceDto,
    @Request() req: any,
  ) {
    return this.shopService.grantBalance(shopId, dto, req.user.userId);
  }

  @Post(':shopId/purchase')
  purchase(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: PurchaseDto,
    @Request() req: any,
  ) {
    return this.shopService.purchase(shopId, dto, req.user.userId);
  }

  @Get(':shopId/logs')
  logs(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('limit') limit: string | undefined,
    @Request() req: any,
  ) {
    const n = limit ? Number(limit) : undefined;
    return this.shopService.listLogs(shopId, req.user.userId, Number.isFinite(n as any) ? n : undefined);
  }
}
