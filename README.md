# 集市 Demo（单容器版）

最小可跑版本：单个容器里跑 Postgres + Redis + NestJS 后端 + 已编译好的 Vue3/Element Plus 前端。

## 快速跑起来
```bash
cp .env.example .env
mkdir -p config
cp config.toml.example config/config.toml
docker compose up --build
# 打开 http://localhost:8080
```

首次启动会读取 `MARKET_CONFIG` 指向的配置文件（默认 `./config/config.toml`）。如果文件不存在，容器会自动生成，并在日志里输出一次性初始超管密码（会明文写入 `config.toml`）。

## 用 docker-compose（一键单容器）
```bash
cd market-app
# 推荐只改 .env，避免改 docker-compose.yml 导致 git pull 冲突
cp .env.example .env
docker compose up --build
# 打开 http://localhost:8080
```
默认会把 Postgres 数据保存在当前目录的 `data/`（映射到容器内 `/data`）。
另外需要准备 `./config/config.toml`（可由 `config.toml.example` 复制修改）。
如果更新后出现 Prisma `db push` 的 schema 变更警告/失败并导致容器重启（通常是旧数据不兼容新唯一约束），建议：
- 测试环境直接删除 `./data` 后重启（全量清库）；或
- 临时设置 `MARKET_RESET_DB_ON_SCHEMA_ERROR=true` 让容器自动重置 `public` schema（会丢数据）。

## 云服务器更新（git pull 后应用）
```bash
cd /opt/market-app
git pull
docker compose pull
docker compose up -d
docker compose logs -f --tail=200
```
注意：
- 不要把账号密码硬写进 `docker-compose.yml`；请用 `.env`（这样更新时不会冲突）。
- 如果你之前改过 `docker-compose.yml`，先 `git checkout -- docker-compose.yml`，再把你的变量写回 `.env`。
- 如果 schema 变更导致反复重启：测试环境可删 `./data`；生产环境请先备份 volume 再处理。

## 本地开发
```bash
# 依赖：本机有 Postgres (5432) 与 Redis (6379)
cd backend && npm install
cd ../frontend && npm install

# 启动后端
cd ../backend
DATABASE_URL=postgresql://market_user:market_pass@localhost:5432/market_db \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=dev-secret \
npx prisma db push
npm run start:dev

# 启动前端
cd ../frontend
npm run dev -- --host
```
前端默认请求 `/api`，和后端同源部署时无需额外配置。

注意：如果你的数据库密码含有 `@`、`:`、`/` 等特殊字符，建议你显式设置 `DATABASE_URL`（并对密码做 URL 编码），不要只依赖 `POSTGRES_PASSWORD` 自动拼接。

## WebSocket（WS/WSS）
后端会在 `/ws` 提供 WebSocket 连接，用于心跳与未来的实时刷新（库存/余额/日志）。在 HTTPS 下会自动使用 `wss://`。

## 当前功能
- 超级管理员：由 `config/config.toml` 提供，仅有“平台管理面板”（创建/删除普通账号、查看账号归属、改部分配置）。
- 普通账号：可注册/登录（受配置开关控制）、创建小店成为店长、通过邀请码加入小店成为顾客。
- 邀请码：店长/店员现场生成，默认 10 分钟过期自动清理，可手动删除。
- 钱包：仅“个人余额”（顾客才有余额与背包；店长/店员没有）。
- 摊位/商品：为店铺创建摊位、在摊位下新增商品（Emoji 或图片 URL 作为图标、可选限库存）。
- 余额与购买：购买只扣个人余额；顾客可在开关允许时自助增/减余额（店长/店员在「店铺设置」里控制两个开关）。
- 数据库表：Users / Shops / Stalls / Products / Members / Inventory / Logs，金额均按最小单位整数存储。

## API 文档
- `docs/API.md`

## 目录结构
```
market-app
├── backend/                  # NestJS 服务（后端）
│   ├── prisma/
│   │   └── schema.prisma     # 数据模型（Prisma）
│   ├── src/
│   │   ├── admin/            # 超管平台模块（只给 SUPER_ADMIN）
│   │   ├── account/          # 登录/注册（普通账号）
│   │   ├── auth/             # JWT/Passport
│   │   ├── prisma/           # PrismaService
│   │   ├── redis/            # Redis 连接封装
│   │   ├── shop/             # 小店领域（核心业务）
│   │   │   ├── dto/          # Controller DTO
│   │   │   ├── services/     # 领域服务拆分（重构后的核心）
│   │   │   │   ├── shop-context.service.ts   # requireMember/ensureShop/权限
│   │   │   │   ├── shop-core.service.ts      # 创建/更新/删除小店、summary
│   │   │   │   ├── shop-member.service.ts    # 成员/身份/踢人/改名
│   │   │   │   ├── shop-invite.service.ts    # 邀请码
│   │   │   │   ├── shop-currency.service.ts  # 币种
│   │   │   │   ├── shop-wallet.service.ts    # 余额/开关/管理端查余额
│   │   │   │   ├── shop-stall.service.ts     # 摊位
│   │   │   │   ├── shop-product.service.ts   # 商品/购买/排序
│   │   │   │   ├── shop-inventory.service.ts # 背包/排序/改名
│   │   │   │   ├── shop-log.service.ts       # 日志查询
│   │   │   │   └── shop-stats.service.ts     # 店铺统计
│   │   │   ├── invite.cleanup.ts             # 邀请码过期清理
│   │   │   ├── shop.controller.ts
│   │   │   ├── shop.module.ts
│   │   │   └── shop.service.ts               # façade：转发到 services/*
│   │   ├── stats/            # 平台统计（公开只读）
│   │   ├── ws/               # WebSocket（/ws）
│   │   ├── app.module.ts
│   │   └── main.ts
│   └── package.json
├── frontend/                 # Vue3 + Element Plus（前端）
├── docs/
│   └── API.md                # API 文档（后端为准）
├── config/                   # 配置目录（挂载到容器）
│   └── config.toml           # 运行时配置（首次启动可自动生成）
├── data/                     # Postgres 数据目录（volume）
├── .env.example              # 环境变量示例（复制为 .env）
├── docker-compose.yml        # 生产/服务器用：拉取镜像运行
├── docker-compose.dev.yml    # 本地开发用：build 覆盖 image
├── Dockerfile                # 单容器镜像（Node + Postgres + Redis）
└── entrypoint.sh             # 启动脚本：初始化 PG/Redis、Prisma sync、起后端
```
