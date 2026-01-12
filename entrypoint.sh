#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/data/postgres"
LOG_FILE="$DATA_DIR/server.log"
PORT="${PORT:-3000}"
DB_USER="${POSTGRES_USER:-market_user}"
DB_PASS="${POSTGRES_PASSWORD:-market_pass}"
DB_NAME="${POSTGRES_DB:-market_db}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
# If you didn't explicitly provide DATABASE_URL, derive it from POSTGRES_* envs.
if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
else
  export DATABASE_URL
fi
export REDIS_URL

mkdir -p "$DATA_DIR"

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
    gosu postgres pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='*'" -l "$LOG_FILE" -w start
  fi
}

stop_services() {
  echo "Shutting down services..."
  gosu postgres pg_ctl -D "$DATA_DIR" -m fast stop || true
  redis-cli -u "$REDIS_URL" shutdown || true
}

ensure_db_and_permissions() {
  echo "Ensuring database/user privileges..."

  gosu postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -v "db_user=${DB_USER}" -v "db_pass=${DB_PASS}" -v "db_name=${DB_NAME}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_pass');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_pass');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') THEN
    EXECUTE format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user');
  END IF;
END $$;

EXECUTE format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user');
SQL

  gosu postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$DB_NAME" \
    -v "db_user=${DB_USER}" -v "db_name=${DB_NAME}" <<'SQL'
GRANT ALL PRIVILEGES ON DATABASE :"db_name" TO :"db_user";
GRANT ALL ON SCHEMA public TO :"db_user";
ALTER SCHEMA public OWNER TO :"db_user";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO :"db_user";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO :"db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO :"db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO :"db_user";
SQL
}

trap stop_services SIGINT SIGTERM

init_postgres
start_services
ensure_db_and_permissions

cd /app/backend
echo "Running Prisma schema sync..."
npx prisma db push

echo "Starting backend on port ${PORT}..."
node dist/main.js
