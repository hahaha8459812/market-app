import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './app-config/app-config.service';
import { WsService } from './ws/ws.service';
import { resolveFrontendDistDir } from './frontend-dist';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // SPA history fallback:
  // Refreshing routes like /manager/2 should return index.html (not JSON error).
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  const indexHtml = join(resolveFrontendDistDir(), 'index.html');
  instance.get('*', (req: any, res: any, next: any) => {
    if (req.method !== 'GET') return next();
    const p = req.path || '';
    if (p.startsWith('/api') || p.startsWith('/ws')) return next();
    // let static assets pass through
    if (p.includes('.')) return next();
    try {
      return res.sendFile(indexHtml, (err: any) => {
        if (err) {
          // If index.html cannot be served, do not bubble up as 500 JSON.
          return res.status(404).send('Frontend dist missing; please rebuild image.');
        }
      });
    } catch (err) {
      // res.sendFile can throw synchronously (e.g. non-absolute path)
      // Keep output stable and log for diagnosis.
      // eslint-disable-next-line no-console
      console.error('SPA fallback sendFile failed', err);
      return res.status(500).send('SPA fallback failed; check server logs.');
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  const httpServer = app.getHttpServer();
  const wsConfig = app.get(AppConfigService).getWsConfig();
  const ws = app.get(WsService);
  ws.init(httpServer);
  ws.startHeartbeat(wsConfig.pingIntervalMs);
}
bootstrap();
