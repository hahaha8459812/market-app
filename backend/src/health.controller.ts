import { Controller, Get } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveFrontendDistDir } from './frontend-dist';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    const dist = resolveFrontendDistDir();
    const index = join(dist, 'index.html');
    return {
      ok: true,
      frontendDist: dist,
      indexExists: existsSync(index),
    };
  }
}

