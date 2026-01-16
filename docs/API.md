# 集市（Market）后端 API 文档（Demo）

统一前缀：`/api`

鉴权：除登录/注册外，接口均需 `Authorization: Bearer <JWT>`

角色：
- 平台角色：`SUPER_ADMIN`（仅平台管理，不可使用小店 API）
- 平台角色：`PLAYER`（正常账号）
- 小店身份：`OWNER` / `CLERK` / `CUSTOMER`

通用错误：
- `401` 未登录或 token 无效
- `403` 权限不足
- `400` 参数错误/业务校验失败
- `404` 资源不存在

时间字段：ISO 字符串（UTC）

---

## 0. 数据模型（关键字段）

说明：本项目为“独立币种”模型，不做任何换汇/折算；金额均为整数（可自行约定最小单位，比如“金币=1”）。

- `Shop`：`id` `name` `allowCustomerInc/Dec`
- `Currency`：`id` `shopId` `name`
- `Member`：`id` `shopId` `userId` `charName` `role(OWNER|CLERK|CUSTOMER)`
- `MemberBalance`：`memberId + currencyId` 唯一；字段 `amount`（仅顾客使用）
- `Product`：`id` `stallId` `name` `icon?` `stock` `isLimitStock` `isActive` `priceState` `priceAmount?` `priceCurrencyId?`
  - `priceState=PRICED`：必须有 `priceAmount + priceCurrencyId` 且币种 `isActive=true`
  - `priceState=UNPRICED`：无标价（用于“未解锁/暂不售卖”），玩家可见但不可购买
  - `priceState=DISABLED_CURRENCY`：系统维护（币种被删除后自动进入），玩家可见但不可购买
- `Inventory`：`memberId + name` 唯一；字段 `name` `quantity` `sortOrder`
  - 购买入包后为“独立自定义物品”，不再与商店商品绑定（`productId` 可能为空）
  - 数量变动后若 `quantity<=0` 该条目会被删除
- `Log`：`shopId` `memberId?` `actorId?` `currencyId?` `type` `content` `amount` `beforeAmount?` `afterAmount?` `createdAt`
  - 响应会额外补充 `actorName/actorRole/memberName/memberRole` 方便前端展示

---

## 1. 认证 Auth

### POST `/auth/login`
请求：
```json
{ "username": "u", "password": "p" }
```
响应：
```json
{ "accessToken": "...", "user": { "id": 1, "username": "u", "role": "PLAYER" } }
```

### POST `/auth/register`
说明：受 `config.toml` 的 `features.allow_register` 控制。

请求：
```json
{ "username": "u", "password": "p" }
```

### GET `/auth/me`
响应：
```json
{ "id": 1, "username": "u", "role": "PLAYER" }
```

---

## 2. 平台管理 Admin（仅 SUPER_ADMIN）

### GET `/admin/stats`
响应示例：
```json
{ "users": 10, "shops": 3, "activeMembers": 12, "stalls": 8, "products": 40, "currencies": 9 }
```

### GET `/admin/config`
响应：返回可查看的配置预览（不包含超管密码）。

### PATCH `/admin/config`
请求：
```json
{ "allow_register": true, "ws_ping_interval_ms": 25000 }
```

### GET `/admin/users`
列出普通账号（`PLAYER`）。

### POST `/admin/users`
创建普通账号。

### GET `/admin/users/:id`
查看账号作为店长/顾客加入的小店列表。

### DELETE `/admin/users/:id`
删除普通账号（会删除其店铺/成员/背包/日志等数据）。

---

## 3. 账号设置 Account

### PATCH `/account/username`
请求：
```json
{ "username": "newName" }
```

### PATCH `/account/password`
请求：
```json
{ "currentPassword": "old", "newPassword": "new" }
```

---

## 4. 小店 Shops（禁止 SUPER_ADMIN）

### GET `/shops`
返回我加入的小店列表（包含我的身份/角色名）。

### POST `/shops`
创建小店（创建者成为 `OWNER`），并自动创建默认币种：金币/银币/铜币。

请求：
```json
{ "name": "示例小店" }
```

### PATCH `/shops/:shopId`
修改店名（仅店长/店员）。

请求：
```json
{ "name": "新店名" }
```

### DELETE `/shops/:shopId`
注销小店（仅店长）。

### POST `/shops/join`
通过邀请码加入（成为 `CUSTOMER`）。

请求：
```json
{ "inviteCode": "ABC123" }
```

### DELETE `/shops/:shopId/leave`
退出小店（仅顾客）。

---

## 5. 小店概览/统计

### GET `/shops/:shopId/summary`
说明：返回店铺信息、我的身份、币种列表、以及余额快照（仅顾客有余额）。

响应示例：
```json
{
  "shop": { "id": 1, "name": "示例", "allowCustomerInc": false, "allowCustomerDec": false },
  "member": { "id": 10, "shopId": 1, "userId": 2, "charName": "某PL", "role": "CUSTOMER", "isActive": true },
  "currencies": [{ "id": 1, "name": "金币", "isActive": true }],
  "balances": {
    "personal": [{ "currencyId": 1, "amount": 100 }]
  }
}
```

### GET `/shops/:shopId/stats?include=balances`
仅店长/店员。返回店铺统计信息。

---

## 6. 币种 Currencies（独立币种）

### GET `/shops/:shopId/currencies`
返回该店铺币种列表。

### POST `/shops/:shopId/currencies`
仅店长/店员。

请求：
```json
{ "name": "积分" }
```

### PATCH `/shops/:shopId/currencies/:currencyId`
仅店长/店员。

请求：
```json
{ "name": "金币(新)" }
```

### DELETE `/shops/:shopId/currencies/:currencyId`
仅店长/店员。需要显式确认。

请求：
```json
{ "confirm": true }
```
备注：
- `DELETE` 带 JSON body 时，axios 需用：`axios.delete(url, { data: { confirm: true } })`

行为：
- 真删除币种（物理删除）
- 删除该币种的所有成员余额记录（不可欠账）
- 使用该币种定价的商品会被清空价格并变为 `UNPRICED`（玩家可见但不可购买）
- 历史日志的 `currencyId` 会被置空（仍保留“删除币种”的日志记录）

---

## 7. 余额变动

### POST `/shops/:shopId/self-adjust`
仅顾客。用于跑团结算/场外花销（受店铺开关控制）。

请求：
```json
{ "currencyId": 1, "amount": 50 }
```
说明：
- `amount > 0` 需要 `allowCustomerInc=true`
- `amount < 0` 需要 `allowCustomerDec=true`
- 禁止欠账（结果余额不能小于 0）

### PATCH `/shops/:shopId/customer-adjust`
仅店长/店员。控制顾客是否可自增/自减余额。

请求：
```json
{ "allowCustomerInc": true, "allowCustomerDec": true }
```

### POST `/shops/:shopId/grant-balance`
仅店长/店员。

请求（给某顾客加减余额）：
```json
{ "memberId": 123, "currencyId": 1, "amount": 100 }
```
说明：
- 禁止欠账

### GET `/shops/:shopId/members/:memberId/balances`
仅店长/店员。查看指定顾客余额（用于“管理端查看顾客背包”）。

---

## 9. 摊位/商品

### GET `/shops/:shopId/stalls`
说明：
- 顾客：只返回启用摊位 + 上架商品
- 店长/店员：返回全部摊位 + 全部商品（含隐藏/下架）

### POST `/shops/:shopId/stalls`
仅店长/店员。

请求：
```json
{ "name": "旅者摊位", "description": "..." }
```

### PATCH `/shops/:shopId/stalls/:stallId`
仅店长/店员。可修改 `name/description/isActive`（isActive=false 表示对顾客隐藏）。

### POST `/shops/stalls/:stallId/products`
仅店长/店员。

请求（定价）：
```json
{ "name": "治疗药水", "priceState": "PRICED", "priceAmount": 10, "priceCurrencyId": 1, "stock": 5, "isLimitStock": true, "icon": "🧪", "description": "..." }
```
请求（无定价/未解锁）：
```json
{ "name": "神秘宝箱", "priceState": "UNPRICED", "stock": 0, "isLimitStock": true }
```

### PATCH `/shops/:shopId/products/:productId`
仅店长/店员。可修改 `name/icon/stock/isLimitStock/isActive/description`，以及：
- `priceState=PRICED` 时必须提供 `priceAmount + priceCurrencyId`
- `priceState=UNPRICED` 会清空价格字段
- `priceState=DISABLED_CURRENCY` 由系统维护，不允许手动设置

---

## 10. 购买

### POST `/shops/:shopId/purchase`
仅顾客。

请求：
```json
{ "productId": 1, "quantity": 2 }
```
规则：
- 商品必须上架且 `priceState=PRICED`，且定价币种 `isActive=true`
- 禁止欠账（余额不足则失败）
- 只扣个人余额
- 同一事务内完成：扣款/减库存/入背包/写流水
- 入背包后物品为独立自定义条目：以“商品名”为 key 合并数量

---

## 11. 背包 Inventory

### GET `/shops/:shopId/inventory`
顾客：返回自己的背包。  
店长/店员：需要 `?memberId=xxx` 指定顾客，且只能查看顾客背包。

### POST `/shops/:shopId/inventory/adjust`
仅店长/店员。调整某顾客背包数量（同名合并）。
规则：
- 同名（完全相同的 `name` 字符串）直接合并数量
- `quantityDelta` 变更后若数量 `<=0` 则删除该条目

请求：
```json
{ "memberId": 123, "name": "宝石(珍稀)", "quantityDelta": 1 }
```

### POST `/shops/:shopId/inventory/self-adjust`
仅顾客。自助增减自己背包数量（同名合并）。
规则同上（数量 `<=0` 则删除）。

请求：
```json
{ "name": "绷带", "quantityDelta": 2 }
```

---

## 12. 成员与权限

### GET `/shops/:shopId/public-members`
所有加入者可用。返回简化成员列表（角色名/身份）。

### GET `/shops/:shopId/members`
仅店长/店员。返回成员完整列表（含 userId）。

### POST `/shops/:shopId/set-member-role`
仅店长可任命/撤销店员。

请求：
```json
{ "memberId": 123, "role": "CLERK" }
```

---

## 13. 邀请码

### POST `/shops/:shopId/invites`
仅店长/店员。创建邀请码（默认 10 分钟）。

请求：
```json
{ "ttlMinutes": 10 }
```

### GET `/shops/:shopId/invites`
仅店长/店员。列出未过期邀请码。

### DELETE `/shops/:shopId/invites/:inviteId`
仅店长/店员。手动删除邀请码。

---

## 14. 日志

### GET `/shops/:shopId/logs?limit=50`
同一小店内所有成员共享同一份日志（透明审计）。  
`limit` 会被上限钳制到 `config.toml` 的 `logs.shared_limit`（默认 200）。

展示建议：
- 币种显示：用 `currencyId` 关联 `GET /shops/:shopId/currencies` 的列表（即使 `isActive=false` 也要能显示历史币种名）
- 金额变动：优先用 `beforeAmount/afterAmount` 做差与展示；若为空再用 `amount`
