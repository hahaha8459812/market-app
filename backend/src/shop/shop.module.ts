import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { InviteCleanup } from './invite.cleanup';

@Module({
  controllers: [ShopController],
  providers: [ShopService, InviteCleanup],
})
export class ShopModule {}
