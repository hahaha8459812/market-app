import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { InviteCleanup } from './invite.cleanup';
import { ShopContextService } from './services/shop-context.service';
import { ShopCoreService } from './services/shop-core.service';
import { ShopMemberService } from './services/shop-member.service';
import { ShopInviteService } from './services/shop-invite.service';
import { ShopCurrencyService } from './services/shop-currency.service';
import { ShopInventoryService } from './services/shop-inventory.service';
import { ShopStallService } from './services/shop-stall.service';
import { ShopProductService } from './services/shop-product.service';
import { ShopWalletService } from './services/shop-wallet.service';
import { ShopLogService } from './services/shop-log.service';
import { ShopStatsService } from './services/shop-stats.service';

@Module({
  controllers: [ShopController],
  providers: [
    ShopService,
    InviteCleanup,
    ShopContextService,
    ShopCoreService,
    ShopMemberService,
    ShopInviteService,
    ShopCurrencyService,
    ShopInventoryService,
    ShopStallService,
    ShopProductService,
    ShopWalletService,
    ShopLogService,
    ShopStatsService,
  ],
})
export class ShopModule {}
