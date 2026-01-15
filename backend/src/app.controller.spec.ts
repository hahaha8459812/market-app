import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('AppController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = app.get<HealthController>(HealthController);
  });

  describe('health', () => {
    it('should return ok', () => {
      expect(controller.getHealth().ok).toBe(true);
    });
  });
});
