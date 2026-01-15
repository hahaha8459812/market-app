import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function resolveFrontendDistDir(): string {
  const env = process.env.FRONTEND_DIST_PATH;
  const candidates = [
    env,
    '/app/frontend/dist',
    resolve(__dirname, '..', '..', 'frontend', 'dist'),
    resolve(process.cwd(), '..', 'frontend', 'dist'),
    resolve(process.cwd(), 'frontend', 'dist'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    try {
      if (existsSync(join(dir, 'index.html'))) return dir;
    } catch {
      // ignore
    }
  }

  return candidates[0] ?? '/app/frontend/dist';
}

