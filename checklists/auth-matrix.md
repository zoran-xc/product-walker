# 权限矩阵扫描清单

> 横向扫描所有 route endpoint，找出 auth middleware 缺失 + IDOR 漏洞 + 限流缺失的违规。
>
> **触发信号**：发现 1 个 endpoint 缺 auth middleware 或未做所有权校验 → 全路由扫描同类模式。

## 何时触发

- 发现某 endpoint 无 auth middleware → 触发 auth 矩阵扫描
- 发现某 endpoint 用 `req.params.id` 直接查 DB 未校验所有权 → 触发 IDOR 扫描
- 发现某 endpoint 写操作无 rate limit → 触发限流扫描
- 发现某 endpoint 管理操作（admin / superadmin）无角色校验 → 触发角色矩阵扫描

## 检查项

### 1. auth middleware 覆盖

- [ ] 所有非 public 路由（除 /login / /register / /health / /public）必挂 auth middleware
- [ ] auth middleware 链路：authenticate → authorize（角色）→ ownership（IDOR）
- [ ] public 路由清单显式声明（白名单），非白名单必挂 auth
- [ ] WebSocket / SSE 长连接也要 auth（首包校验 token）

**案例**：yonder auth-matrix 扫描确认 133 路由 100% auth 覆盖

### 2. IDOR（不安全直接对象引用）防护

- [ ] 所有 `req.params.xxxId` / `req.query.xxxId` 查 DB 后必校验「当前 user 是否拥有该资源」
- [ ] 重点：群组 / 会话 / Agent / Provider / Channel / ChannelGroup 等 owner-able 资源
- [ ] 校验方式：DB 查询 WHERE 条件带 `userId`（最稳）或查后 `if (resource.userId !== userId) throw forbidden()`
- [ ] 写操作（POST/PUT/DELETE）必校验所有权，读操作（GET）也要校验（防数据泄露）
- [ ] 子资源也要校验父资源所有权（如 ChannelGroup 下的 ChannelMember）

**案例**：yonder PW-BUG-027（POST /channels/groups/:gid/stop 未校验 gid 所有权 → 任意用户可停止他人 channel group）、PW-BUG-028（GET /channels/groups/:gid/members 未校验所有权 → 任意用户可看他人群成员）

### 3. 限流覆盖

- [ ] 登录 / 注册 / 改密 / 发送验证码等高风险 endpoint 必挂 rate limit
- [ ] rate limit 维度：IP（防代理）+ account（防针对）双维度
- [ ] rate limit 触发返回 429 + Retry-After header
- [ ] admin / 管理操作也要限流（防内部滥用 + 防账号被盗后批量操作）

**案例**：yonder PW-BUG-029（POST /admin/login 无 rate limit → 暴力破解 admin 账号）

### 4. 角色矩阵

- [ ] admin endpoint 必挂 admin middleware（校验 user.role === 'admin'）
- [ ] superadmin 操作（如删用户 / 改 system config）必挂 superadmin middleware
- [ ] 角色提升路径严格（user → admin 必由 superadmin 操作，不能自助提升）
- [ ] role 字段进 DB 前校验枚举值（防 user/admin/superadmin 之外的值）

### 5. 资源所有权传递

- [ ] 父资源校验后，子资源操作也要再校验（防子资源被父资源所有权绕过）
- [ ] 软删资源（deletedAt IS NOT NULL）不能被访问（即便 owner 也不行）
- [ ] 共享资源（如 conversation 的群成员）校验 membership 而非 ownership
- [ ] 邀请码 / shareCode 等公开访问的资源要校验过期 + 使用次数

## 扫描方法

1. **Grep 路由声明**：`router\.(get|post|put|patch|delete)\(` 或 `fastify\.(get|post|...)`
2. **提取所有 endpoint 清单**：method + path + middleware chain
3. **逐 endpoint 判断**：
   - 是否 public（白名单）
   - 是否挂 auth middleware
   - 是否含 `req.params.xxxId` / `req.query.xxxId`
   - 是否在 handler 内校验所有权
   - 是否为高风险写操作（登录/注册/改密）→ 是否挂 rate limit
4. **DB schema 对照**：哪些表有 userId 字段（owner-able），相关 endpoint 是否校验
5. **角色对照**：admin endpoint 是否挂 admin middleware

## 产出格式

扫描报告含：

1. **扫描摘要**：路由总数 / auth 覆盖率 / IDOR 风险数 / 限流缺失数 / 角色矩阵完整性
2. **完整路由矩阵**：表格（method / path / auth / ownership / rate limit / 角色 / 风险）
3. **IDOR 违规清单**：表格（endpoint / 缺什么 / 影响 / 建议）
4. **限流缺失清单**：表格（endpoint / 当前 / 建议 limit 维度）
5. **角色矩阵缺口**：哪些 admin endpoint 缺 admin middleware
6. **新 bug 上报**：IDOR + 限流缺失 + 角色缺口均单独上报

## yonder 案例参考

- 报告：`PW-SCAN-auth-matrix.md`
- 触发 bug：无（横向扫描自主发现）
- 发现的 bug：PW-BUG-027（POST /channels/groups/:gid/stop IDOR）、PW-BUG-028（GET /channels/groups/:gid/members IDOR）、PW-BUG-029（POST /admin/login 无限流）
- 扫描规模：133 路由 / auth 100% / 3 IDOR + 1 缺限流
- 关键反模式：「params.id 直接查 DB 不校验所有权」「子资源操作忽略父资源所有权」
- 修复策略：新增 `requireOwnedChannelGroup(gid, userId)` 私有方法 + 在 route 入口调用
