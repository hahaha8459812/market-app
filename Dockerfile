FROM node:20-bookworm

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client redis-server \
  && rm -rf /var/lib/apt/lists/*

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
RUN npm install

WORKDIR /app/frontend
ENV VITE_API_BASE=/api
RUN npm install && npm run build

WORKDIR /app/backend
RUN npm run build

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PORT=3000 \
  DATABASE_URL=postgresql://market_user:market_pass@localhost:5432/market_db \
  REDIS_URL=redis://localhost:6379 \
  JWT_SECRET=change-me

EXPOSE 3000
CMD ["/app/entrypoint.sh"]
