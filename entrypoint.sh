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
    gosu postgres psql -U postgres -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" || true
    gosu postgres psql -U postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
    gosu postgres pg_ctl -D "$DATA_DIR" -m fast stop
  fi
}

start_services() {
  redis-server --daemonize yes
  gosu postgres pg_ctl -D "$DATA_DIR" -o "-c listen_addresses='*'" -l "$LOG_FILE" -w start
}

stop_services() {
  echo "Shutting down services..."
  gosu postgres pg_ctl -D "$DATA_DIR" -m fast stop || true
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
