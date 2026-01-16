#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/data/postgres"
LOG_FILE="$DATA_DIR/server.log"
PORT="${PORT:-3000}"
DB_USER="${POSTGRES_USER:-market_user}"
DB_PASS="${POSTGRES_PASSWORD:-market_pass}"
DB_NAME="${POSTGRES_DB:-market_db}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
CONFIG_PATH="${MARKET_CONFIG:-/app/config/config.toml}"
# If you didn't explicitly provide DATABASE_URL, derive it from POSTGRES_* envs.
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
else
  export DATABASE_URL
fi
export REDIS_URL
export MARKET_CONFIG="$CONFIG_PATH"

mkdir -p "$DATA_DIR"

# ensure config exists and avoids plaintext password on disk
ensure_config() {
  mkdir -p "$(dirname "$CONFIG_PATH")"
  cd /app/backend

  node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const toml = require('toml');
const { stringify } = require('@iarna/toml');
const bcrypt = require('bcrypt');

const configPath = process.env.MARKET_CONFIG;
if (!configPath) {
  console.error('MARKET_CONFIG 未设置');
  process.exit(1);
}

function writeConfig(obj) {
  fs.writeFileSync(configPath, stringify(obj), 'utf-8');
}

async function main() {
  const exists = fs.existsSync(configPath);
  const stat = exists ? fs.statSync(configPath) : null;
  if (!exists || !stat.isFile() || stat.size === 0) {
    const password = crypto.randomBytes(18).toString('base64url'); // ~24 chars
    const passwordHash = await bcrypt.hash(password, 10);
    const next = {
      super_admin: { username: 'admin', password_hash: passwordHash },
      features: { allow_register: true },
      ws: { ping_interval_ms: 25000, client_timeout_ms: 60000 },
    };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    writeConfig(next);
    console.log(`已生成默认配置：${configPath}`);
    console.log(`超级管理员用户名：admin`);
    console.log(`超级管理员初始密码（仅显示一次）：${password}`);
    return;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const cfg = toml.parse(raw);
  if (!cfg.super_admin || !cfg.super_admin.username) {
    throw new Error('config.toml 缺少 [super_admin] username');
  }

  if (!cfg.super_admin.password_hash && cfg.super_admin.password) {
    const passwordHash = await bcrypt.hash(String(cfg.super_admin.password), 10);
    cfg.super_admin.password_hash = passwordHash;
    delete cfg.super_admin.password;
    writeConfig(cfg);
    console.log('已自动升级：super_admin.password -> super_admin.password_hash（避免明文密码落盘）');
  }

  if (!cfg.super_admin.password_hash && !cfg.super_admin.password) {
    throw new Error('config.toml 缺少 [super_admin] password_hash（或 password）');
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
NODE
}

# add postgres bin (initdb) to PATH
find_initdb() {
  find /usr/lib/postgresql -type f -name initdb -printf '%h\n' 2>/dev/null | head -n 1
}

PG_BINDIR="$(find_initdb)"
if [ -n "$PG_BINDIR" ]; then
  export PATH="$PG_BINDIR:$PATH"
else
  echo "initdb not found; PostgreSQL binaries missing" >&2
  exit 1
fi

init_postgres() {
  if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
    echo "Initializing PostgreSQL data directory..."
    chown -R postgres:postgres "$DATA_DIR"
    gosu postgres initdb -D "$DATA_DIR" -U postgres -A trust > /dev/null
    gosu postgres pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='*'" -l "$LOG_FILE" -w start
    gosu postgres pg_ctl -D "$DATA_DIR" -m fast stop
  fi
}

start_services() {
  if ! redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
    redis-server --daemonize yes
  fi

  if ! gosu postgres pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
    if [ -f "$DATA_DIR/postmaster.pid" ]; then
      rm -f "$DATA_DIR/postmaster.pid"
    fi
    gosu postgres pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='127.0.0.1'" -l "$LOG_FILE" -w start
  fi

  for _ in $(seq 1 30); do
    if gosu postgres pg_isready -h 127.0.0.1 -p 5432 -U postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready" >&2
  exit 1
}

stop_services() {
  echo "Shutting down services..."
  gosu postgres pg_ctl -D "$DATA_DIR" -m fast stop || true
  redis-cli -u "$REDIS_URL" shutdown || true
}

ensure_db_and_permissions() {
  echo "Ensuring database/user privileges..."

  local db_user_escaped db_name_escaped db_pass_escaped role_exists db_exists
  db_user_escaped="${DB_USER//\'/\'\'}"
  db_name_escaped="${DB_NAME//\'/\'\'}"
  db_pass_escaped="${DB_PASS//\'/\'\'}"

  role_exists="$(gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${db_user_escaped}'" || true)"
  if [ "$role_exists" != "1" ]; then
    gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "CREATE ROLE \"${DB_USER}\" LOGIN PASSWORD '${db_pass_escaped}';"
  else
    gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${db_pass_escaped}';"
  fi

  db_exists="$(gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '${db_name_escaped}'" || true)"
  if [ "$db_exists" != "1" ]; then
    gosu postgres createdb -h 127.0.0.1 -p 5432 -U postgres -O "$DB_USER" "$DB_NAME"
  fi

  gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\";"

  gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL PRIVILEGES ON DATABASE "${DB_NAME}" TO "${DB_USER}";
GRANT ALL ON SCHEMA public TO "${DB_USER}";
ALTER SCHEMA public OWNER TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${DB_USER}";
SQL
}

prisma_sync() {
  echo "Running Prisma schema sync..."
  if npx prisma db push --accept-data-loss; then
    return 0
  fi

  if [ "${MARKET_RESET_DB_ON_SCHEMA_ERROR:-}" = "true" ]; then
    echo "Prisma sync failed; resetting public schema because MARKET_RESET_DB_ON_SCHEMA_ERROR=true" >&2
    gosu postgres psql -h 127.0.0.1 -p 5432 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
ALTER SCHEMA public OWNER TO "${DB_USER}";
GRANT ALL ON SCHEMA public TO "${DB_USER}";
SQL
    npx prisma db push --accept-data-loss
    return $?
  fi

  echo "Prisma sync failed. If this is a demo environment, you can:" >&2
  echo "  - wipe data volume: rm -rf ./data  (on host) and restart, OR" >&2
  echo "  - set MARKET_RESET_DB_ON_SCHEMA_ERROR=true to auto-reset schema (DATA LOSS)." >&2
  return 1
}

trap stop_services SIGINT SIGTERM

ensure_config
init_postgres
start_services
ensure_db_and_permissions

cd /app/backend
prisma_sync

echo "Starting backend on port ${PORT}..."
if [ -f dist/main.js ]; then
  exec node dist/main.js
fi
if [ -f dist/src/main.js ]; then
  exec node dist/src/main.js
fi

echo "Backend build output missing; running build..." >&2
npm run build
exec node dist/src/main.js
