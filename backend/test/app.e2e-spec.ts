import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { resolve } from 'node:path';

const runE2e = process.env.RUN_E2E === 'true';

(runE2e ? describe : describe.skip)('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.MARKET_CONFIG = resolve(__dirname, '..', '..', 'config', 'config.toml.example');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        if (!res.body?.ok) throw new Error('health not ok');
      });
  });
});
