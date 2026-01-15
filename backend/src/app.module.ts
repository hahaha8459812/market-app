import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AppConfigModule } from './app-config/app-config.module';
import { WsModule } from './ws/ws.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { AccountModule } from './account/account.module';
import { ShopModule } from './shop/shop.module';
import { resolveFrontendDistDir } from './frontend-dist';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: resolveFrontendDistDir(),
      exclude: ['/api*', '/ws*'],
    }),
    PrismaModule,
    RedisModule,
    AppConfigModule,
    WsModule,
    AuthModule,
    AdminModule,
    AccountModule,
    ShopModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
