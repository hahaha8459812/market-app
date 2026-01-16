FROM node:20-bookworm

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client redis-server gosu \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --ignore-scripts

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
ENV VITE_API_BASE=/api
RUN npm ci

WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
RUN npx prisma generate

WORKDIR /app/frontend
RUN npm run build

WORKDIR /app/backend
RUN npm run build

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PORT=3000 \
  REDIS_URL=redis://localhost:6379 \
  JWT_SECRET=change-me

EXPOSE 3000
CMD ["/app/entrypoint.sh"]
