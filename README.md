# 集市 Demo（单容器版）

最小可跑版本：单个容器里跑 Postgres + Redis + NestJS 后端 + 已编译好的 Vue3/Element Plus 前端。

## 快速跑起来
```bash
# 1) 构建镜像
docker build -t market-demo .

# 2) 运行容器
docker run -p 8080:3000 \
  -e JWT_SECRET=请改成32位随机串 \
  -e POSTGRES_USER=Ess810815 \
  -e POSTGRES_PASSWORD=Ess810815 \
  -e POSTGRES_DB=Ess810815 \
  market-demo
# 打开 http://localhost:8080
```

启动后首次访问页面，先在前端完成「注册超级管理员」，之后用该账号登录即可管理店铺/摊位/商品/余额。

## 用 docker-compose（一键单容器）
```bash
cd market-app
# 可按需修改环境变量（推荐直接在 docker-compose.yml 或 .env 里固定写死）
JWT_SECRET=请改成32位随机串 POSTGRES_USER=Ess810815 POSTGRES_PASSWORD=Ess810815 POSTGRES_DB=Ess810815 docker compose up --build
# 打开 http://localhost:8080
```
默认会把 Postgres 数据保存在当前目录的 `data/`（映射到容器内 `/data`）。

## 本地开发
```bash
# 依赖：本机有 Postgres (5432) 与 Redis (6379)
cd backend && npm install
cd ../frontend && npm install

# 启动后端
cd ../backend
DATABASE_URL=postgresql://Ess810815:Ess810815@localhost:5432/Ess810815 \
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

## 当前功能
- 首次访问时注册唯一超级管理员；随后使用用户名/密码登录获取 JWT。
- 店铺管理：创建店铺（自定义货币规则自动入库）、刷新店铺列表。
- 摊位/商品：为店铺创建摊位、在摊位下新增商品（Emoji 或图片 URL 作为图标、可选限库存）。
- 余额与购买：为角色发放余额（shop 范围内根据角色名 upsert），购买商品时做库存与余额校验并写入流水。
- 数据库表：Users / Shops / Stalls / Products / Members / Inventory / Logs，金额均按最小单位整数存储。

## 目录结构
```
market-app
├── backend/          # NestJS 服务，含 Prisma schema
├── frontend/         # Vue3 + Element Plus 前端，构建产物由后端静态服务
├── Dockerfile        # 单容器镜像（Node + Postgres + Redis）
└── entrypoint.sh     # 容器启动脚本：初始化 Postgres、启动 Redis、同步 Prisma schema、起后端
```
