import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import toml from 'toml';

export type AppConfig = {
  super_admin: {
    username: string;
    password?: string;
    password_hash?: string;
  };
  features?: {
    allow_register?: boolean;
  };
  ws?: {
    ping_interval_ms?: number;
    client_timeout_ms?: number;
  };
};

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;
  private readonly configPath: string;

  constructor() {
    const configPath = process.env.MARKET_CONFIG ?? path.resolve(process.cwd(), '..', 'config.toml');
    this.configPath = configPath;
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = toml.parse(raw) as AppConfig;

    if (!parsed?.super_admin?.username) {
      throw new Error('config.toml 缺少 [super_admin] username');
    }
    if (!parsed?.super_admin?.password_hash && !parsed?.super_admin?.password) {
      throw new Error('config.toml 缺少 [super_admin] password_hash（或 password）');
    }

    this.config = parsed;
  }

  getConfigPath() {
    return this.configPath;
  }

  getRawConfig() {
    return this.config;
  }

  getSuperAdmin() {
    return this.config.super_admin;
  }

  getWsConfig() {
    return {
      pingIntervalMs: this.config.ws?.ping_interval_ms ?? 25_000,
      clientTimeoutMs: this.config.ws?.client_timeout_ms ?? 60_000,
    };
  }

  getFeatures() {
    return {
      allowRegister: this.config.features?.allow_register ?? true,
    };
  }
}
