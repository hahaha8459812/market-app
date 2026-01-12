#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="/data/postgres"
LOG_FILE="$DATA_DIR/server.log"
PORT="${PORT:-3000}"
DB_USER="${POSTGRES_USER:-market_user}"
DB_PASS="${POSTGRES_PASSWORD:-market_pass}"
DB_NAME="${POSTGRES_DB:-market_db}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export DATABASE_URL="${DATABASE_URL:-postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}}"
export REDIS_URL

find_initdb() {
  local bin_path
  bin_path="$(find /usr/lib/postgresql -type f -name initdb -printf '%h\n' 2>/dev/null | head -n 1)"
  echo "${bin_path:-}"
}

PG_BINDIR="$(find_initdb)"
if [ -z "$PG_BINDIR" ]; then
  echo "initdb not found; postgres binaries missing" >&2
  exit 1
fi
export PATH="$PG_BINDIR:$PATH"

mkdir -p "$DATA_DIR"

init_postgres() {
  if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
    echo "Initializing PostgreSQL data directory..."
    initdb -D "$DATA_DIR" -U postgres -A trust > /dev/null
    pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='*'" -l "$LOG_FILE" -w start
    psql -U postgres -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" || true
    psql -U postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
    pg_ctl -D "$DATA_DIR" -m fast stop
  fi
}

start_services() {
  redis-server --daemonize yes
  pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='*'" -l "$LOG_FILE" -w start
}

stop_services() {
  echo "Shutting down services..."
  pg_ctl -D "$DATA_DIR" -m fast stop || true
  redis-cli -u "$REDIS_URL" shutdown || true
}

trap stop_services SIGINT SIGTERM

init_postgres
start_services

cd /app/backend
echo "Running Prisma schema sync..."
npx prisma db push

echo "Starting backend on port ${PORT}..."
node dist/main.js
