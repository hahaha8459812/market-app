import { Injectable } from '@nestjs/common';
import { Role, ShopRole, WalletMode } from '@prisma/client';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateStallDto } from './dto/create-stall.dto';
import { DeleteCurrencyDto } from './dto/delete-currency.dto';
import { GrantBalanceDto } from './dto/grant-balance.dto';
import { JoinShopDto } from './dto/join-shop.dto';
import { PurchaseDto } from './dto/purchase.dto';
import { SelfInventoryAdjustDto } from './dto/self-inventory.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { ShopCoreService } from './services/shop-core.service';
import { ShopCurrencyService } from './services/shop-currency.service';
import { ShopInventoryService } from './services/shop-inventory.service';
import { ShopInviteService } from './services/shop-invite.service';
import { ShopLogService } from './services/shop-log.service';
import { ShopMemberService } from './services/shop-member.service';
import { ShopProductService } from './services/shop-product.service';
import { ShopStallService } from './services/shop-stall.service';
import { ShopStatsService } from './services/shop-stats.service';
import { ShopWalletService } from './services/shop-wallet.service';

@Injectable()
export class ShopService {
  constructor(
    private core: ShopCoreService,
    private member: ShopMemberService,
    private invite: ShopInviteService,
    private currency: ShopCurrencyService,
    private inventory: ShopInventoryService,
    private stall: ShopStallService,
    private product: ShopProductService,
    private wallet: ShopWalletService,
    private log: ShopLogService,
    private stats: ShopStatsService,
  ) {}

  listMyShops(userId: number) {
    return this.member.listMyShops(userId);
  }

  createShop(dto: CreateShopDto, user: { userId: number; role: Role }) {
    return this.core.createShop(dto, user);
  }

  updateShop(shopId: number, userId: number, dto: { name?: string }) {
    return this.core.updateShop(shopId, userId, dto);
  }

  deleteShop(shopId: number, userId: number) {
    return this.core.deleteShop(shopId, userId);
  }

  joinShop(dto: JoinShopDto, userId: number) {
    return this.member.joinShop(dto, userId);
  }

  leaveShop(shopId: number, userId: number) {
    return this.member.leaveShop(shopId, userId);
  }

  updateMyCharName(shopId: number, userId: number, charNameRaw: string) {
    return this.member.updateMyCharName(shopId, userId, charNameRaw);
  }

  shopSummary(shopId: number, userId: number) {
    return this.core.shopSummary(shopId, userId);
  }

  listMembers(shopId: number, userId: number) {
    return this.member.listMembers(shopId, userId);
  }

  listPublicMembers(shopId: number, userId: number) {
    return this.member.listPublicMembers(shopId, userId);
  }

  kickMember(shopId: number, actorUserId: number, targetMemberId: number) {
    return this.member.kickMember(shopId, actorUserId, targetMemberId);
  }

  setMemberRole(shopId: number, userId: number, targetMemberId: number, role: ShopRole) {
    return this.member.setMemberRole(shopId, userId, targetMemberId, role);
  }

  createInvite(shopId: number, userId: number, dto: CreateInviteDto) {
    return this.invite.createInvite(shopId, userId, dto);
  }

  listInvites(shopId: number, userId: number) {
    return this.invite.listInvites(shopId, userId);
  }

  deleteInvite(shopId: number, inviteId: number, userId: number) {
    return this.invite.deleteInvite(shopId, inviteId, userId);
  }

  listCurrencies(shopId: number, userId: number) {
    return this.currency.listCurrencies(shopId, userId);
  }

  createCurrency(shopId: number, userId: number, dto: CreateCurrencyDto) {
    return this.currency.createCurrency(shopId, userId, dto);
  }

  updateCurrency(shopId: number, userId: number, currencyId: number, dto: UpdateCurrencyDto) {
    return this.currency.updateCurrency(shopId, userId, currencyId, dto);
  }

  deleteCurrency(shopId: number, userId: number, currencyId: number, dto: DeleteCurrencyDto) {
    return this.currency.deleteCurrency(shopId, userId, currencyId, dto);
  }

  listStalls(shopId: number, userId: number) {
    return this.stall.listStalls(shopId, userId);
  }

  createStall(shopId: number, dto: CreateStallDto, userId: number) {
    return this.stall.createStall(shopId, dto, userId);
  }

  updateStall(shopId: number, stallId: number, userId: number, dto: { name?: string; description?: string; isActive?: boolean }) {
    return this.stall.updateStall(shopId, stallId, userId, dto);
  }

  deleteStall(shopId: number, stallId: number, userId: number) {
    return this.stall.deleteStall(shopId, stallId, userId);
  }

  createProduct(stallId: number, dto: CreateProductDto, userId: number) {
    return this.product.createProduct(stallId, dto, userId);
  }

  updateProduct(shopId: number, productId: number, userId: number, dto: any) {
    return this.product.updateProduct(shopId, productId, userId, dto);
  }

  reorderProducts(shopId: number, stallId: number, userId: number, productIds: number[]) {
    return this.product.reorderProducts(shopId, stallId, userId, productIds);
  }

  purchase(shopId: number, dto: PurchaseDto, userId: number) {
    return this.product.purchase(shopId, dto, userId);
  }

  getInventory(shopId: number, userId: number, memberId?: number) {
    return this.inventory.getInventory(shopId, userId, memberId);
  }

  reorderInventory(shopId: number, userId: number, inventoryIds: number[]) {
    return this.inventory.reorderInventory(shopId, userId, inventoryIds);
  }

  adjustInventory(shopId: number, userId: number, payload: { memberId: number; name: string; quantityDelta: number }) {
    return this.inventory.adjustInventory(shopId, userId, payload);
  }

  selfAdjustInventory(shopId: number, userId: number, dto: SelfInventoryAdjustDto) {
    return this.inventory.selfAdjustInventory(shopId, userId, dto);
  }

  renameInventory(shopId: number, userId: number, dto: { memberId?: number; oldName: string; newName: string }) {
    return this.inventory.renameInventory(shopId, userId, dto);
  }

  grantBalance(shopId: number, dto: GrantBalanceDto, actorUserId: number) {
    return this.wallet.grantBalance(shopId, dto, actorUserId);
  }

  setCustomerAdjustSwitches(shopId: number, userId: number, allowInc?: boolean, allowDec?: boolean) {
    return this.wallet.setCustomerAdjustSwitches(shopId, userId, allowInc, allowDec);
  }

  selfAdjustBalance(shopId: number, userId: number, currencyId: number, amount: number) {
    return this.wallet.selfAdjustBalance(shopId, userId, currencyId, amount);
  }

  switchWalletMode(shopId: number, userId: number, mode: WalletMode) {
    return this.wallet.switchWalletMode(shopId, userId, mode);
  }

  listLogs(shopId: number, userId: number, limit?: number) {
    return this.log.listLogs(shopId, userId, limit);
  }

  getShopStats(shopId: number, userId: number, include?: string) {
    return this.stats.getShopStats(shopId, userId, include);
  }
}

