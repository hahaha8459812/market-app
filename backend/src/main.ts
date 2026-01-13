import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { WebSocketServer } from 'ws';
import { AppConfigService } from './app-config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  const httpServer = app.getHttpServer();
  const wsConfig = app.get(AppConfigService).getWsConfig();
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    (socket as any).isAlive = true;
    socket.on('pong', () => ((socket as any).isAlive = true));

    socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
  });

  setInterval(() => {
    const now = Date.now();
    for (const socket of wss.clients) {
      if ((socket as any).isAlive === false) {
        socket.terminate();
        continue;
      }
      (socket as any).isAlive = false;
      socket.ping(String(now));
    }
  }, wsConfig.pingIntervalMs).unref();
}
bootstrap();
