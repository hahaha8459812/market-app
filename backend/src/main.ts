import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './app-config/app-config.service';
import { WsService } from './ws/ws.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  const httpServer = app.getHttpServer();
  const wsConfig = app.get(AppConfigService).getWsConfig();
  const ws = app.get(WsService);
  ws.init(httpServer);
  ws.startHeartbeat(wsConfig.pingIntervalMs);
}
bootstrap();
