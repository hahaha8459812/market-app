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

trap stop_services SIGINT SIGTERM

init_postgres
start_services
ensure_db_and_permissions

cd /app/backend
echo "Running Prisma schema sync..."
npx prisma db push

echo "Starting backend on port ${PORT}..."
node dist/main.js
