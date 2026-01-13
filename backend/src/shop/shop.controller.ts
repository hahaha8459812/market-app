import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
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

  @Post('stalls/:stallId/products')
  createProduct(
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: CreateProductDto,
    @Request() req: any,
  ) {
    return this.shopService.createProduct(stallId, dto, req.user.userId);
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
