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
{ "inviteCode": "ABC123", "charName": "角色名" }
```

### DELETE `/shops/:shopId/leave`
退出小店（仅顾客）。

---

## 5. 小店概览/统计

### GET `/shops/:shopId/summary`
说明：返回店铺信息、我的身份、币种列表、以及余额快照（根据钱包模式/身份返回不同字段）。

响应示例：
```json
{
  "shop": { "id": 1, "name": "示例", "walletMode": "PERSONAL", "allowCustomerInc": false, "allowCustomerDec": false, "isSwitching": false },
  "member": { "id": 10, "shopId": 1, "userId": 2, "charName": "某PL", "role": "CUSTOMER", "isActive": true },
  "currencies": [{ "id": 1, "name": "金币", "isActive": true }],
  "balances": {
    "personal": [{ "currencyId": 1, "amount": 100 }],
    "team": []
  }
}
```

### GET `/shops/:shopId/stats?include=balances`
仅店长/店员。`include` 可包含 `balances` 以返回队伍余额列表。

---

## 6. 币种 Currencies（独立币种）

### GET `/shops/:shopId/currencies`
返回该店铺全部币种（含已删除 isActive=false）。

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
行为：
- 币种标记为删除（isActive=false）
- 清零该币种的全队余额与所有成员余额
- 使用该币种定价的商品进入“币种已删除导致无标价”状态（玩家可见不可购买）

---

## 7. 钱包模式（全店统一）

### POST `/shops/:shopId/wallet-mode`
仅店长/店员。

请求：
```json
{ "mode": "TEAM" }
```
规则：
- `PERSONAL -> TEAM`：按币种分别合并所有“顾客”的个人余额到队伍余额；顾客个人余额清零。
- `TEAM -> PERSONAL`：按币种分别把队伍余额均摊给所有顾客；余数给 memberId 最大的顾客；队伍余额清零。
- 切换过程中（`isSwitching=true`）会拒绝购买/余额变动/自助背包修改等操作。

---

## 8. 余额变动

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
- `TEAM` 模式下调整队伍余额；`PERSONAL` 模式下调整个人余额

### PATCH `/shops/:shopId/customer-adjust`
仅店长/店员。控制顾客是否可自增/自减余额。

请求：
```json
{ "allowCustomerInc": true, "allowCustomerDec": true }
```

### POST `/shops/:shopId/grant-balance`
仅店长/店员。

请求（个人模式给某顾客）：
```json
{ "target": "personal", "memberId": 123, "currencyId": 1, "amount": 100 }
```
请求（全队模式给队伍）：
```json
{ "target": "team", "currencyId": 1, "amount": 100 }
```
说明：
- 禁止欠账
- `TEAM` 模式禁止修改个人余额
- `PERSONAL` 模式禁止修改队伍余额

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

---

## 10. 购买

### POST `/shops/:shopId/purchase`
仅顾客。

请求：
```json
{ "productId": 1, "quantity": 2 }
```
规则：
- 商品必须上架且已定价（PRICED），且定价币种未删除
- 禁止欠账（余额不足则失败）
- `TEAM` 模式扣队伍余额；`PERSONAL` 模式扣个人余额
- 同一事务内完成：扣款/减库存/入背包/写流水
- 入背包后物品为独立自定义条目：以“商品名”为 key 合并数量

---

## 11. 背包 Inventory

### GET `/shops/:shopId/inventory`
顾客：返回自己的背包。  
店长/店员：需要 `?memberId=xxx` 指定顾客，且只能查看顾客背包。

### POST `/shops/:shopId/inventory/adjust`
仅店长/店员。调整某顾客背包数量（同名合并）。

请求：
```json
{ "memberId": 123, "name": "宝石(珍稀)", "quantityDelta": 1, "icon": "💎", "extraDesc": "..." }
```

### POST `/shops/:shopId/inventory/self-adjust`
仅顾客。自助增减自己背包数量（同名合并）。

请求：
```json
{ "name": "绷带", "quantityDelta": 2, "icon": "🧻", "extraDesc": "" }
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
顾客：只返回自己的日志。  
店长/店员：返回全店日志。

