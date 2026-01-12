import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { PurchaseDto } from './dto/purchase.dto';

@UseGuards(JwtAuthGuard)
@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get()
  list() {
    return this.shopService.listShops();
  }

  @Post()
  createShop(@Body() dto: CreateShopDto, @Request() req: any) {
    return this.shopService.createShop(dto, req.user);
  }

  @Post(':shopId/stalls')
  createStall(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: CreateStallDto,
    @Request() req: any,
  ) {
    return this.shopService.createStall(shopId, dto, req.user);
  }

  @Post('stalls/:stallId/products')
  createProduct(
    @Param('stallId', ParseIntPipe) stallId: number,
    @Body() dto: CreateProductDto,
    @Request() req: any,
  ) {
    return this.shopService.createProduct(stallId, dto, req.user);
  }

  @Post(':shopId/grant-balance')
  grantBalance(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: GrantBalanceDto,
    @Request() req: any,
  ) {
    return this.shopService.grantBalance(shopId, dto, req.user);
  }

  @Post(':shopId/purchase')
  purchase(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() dto: PurchaseDto,
    @Request() req: any,
  ) {
    return this.shopService.purchase(shopId, dto, req.user);
  }
}
