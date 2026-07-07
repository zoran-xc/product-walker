# 并发安全扫描清单

> 横向扫描所有 service / repo 层，找出 check-then-act 竞态 / SELECT-then-INSERT 并发抛错 / 跨步骤无事务兜底等并发缺陷。
>
> **触发信号**：发现 1 个 service 方法「先 count/find 再 mutate」且两步不在同一事务内 → 全代码库扫描同类模式。

## 何时触发

- 发现某 service 方法 `await repo.count(...)` 后再 `await repo.insert/update/topup`，两步不在同一事务 → 触发 check-then-act 扫描
- 发现某 repo upsert 方法用 SELECT-then-INSERT 而非 ON CONFLICT DO UPDATE → 触发并发 upsert 扫描
- 发现某 service 跨多个 mutate 步骤（如 create + update + emit）无事务包裹 → 触发跨步骤原子性扫描
- 发现某 callback / webhook 入口未做幂等处理（重复回调会重复入账 / 重复创建）→ 触发幂等性扫描
- 发现某代码注释含「并发竞态留作后续优化」「TODO: lock」等 → 直接确认 bug 并扫描同类

## 检查项

### 1. check-then-act 竞态（名额 / 余额 / 上限类）

- [ ] service 层「先 count 后 mutate」是否在同一事务内（FOR UPDATE 锁相关行串行化）
- [ ] 名额类校验（前 N 名奖励 / 限购 / 限领）是否下沉到 DB 事务，而非内存比较
- [ ] 余额类扣减（account balance / credit）是否 FOR UPDATE 锁 balance 行后再 update
- [ ] 上限类校验（群成员上限 / 文件大小 / 频次限制）是否在事务内 count + insert
- [ ] 原子条件 UPDATE 模式（`UPDATE ... WHERE count < limit`）是否优于 SELECT FOR UPDATE（视场景）

**案例**：yonder PW-BUG-055（maybeRewardReferrer count + topup 不在事务内，并发注册超发邀请奖励）、PW-BUG-059（joinByInviteCode countMembers + addMember 不在事务内，并发加入导致群成员超员）

### 2. SELECT-then-INSERT upsert 并发

- [ ] repo 层 upsert 方法是否用 ON CONFLICT DO UPDATE / DO NOTHING，而非 SELECT 已存在再决定 INSERT 或 UPDATE
- [ ] 并发时第二个调用是否走 UPDATE 分支（而非抛 unique constraint error 500）
- [ ] returning() 是否用于判断 created（INSERT 成功）vs fallback SELECT 拿已存在行（冲突）
- [ ] 批量 upsert（batch upsert）是否用单 SQL 多值 INSERT ... ON CONFLICT，而非循环单 upsert N+1

**案例**：yonder PW-BUG-057（drizzle.ts 4 个 upsertChannelGroup/Member/Inbound/Outbound 用 SELECT-then-INSERT，并发抛 500；改 onConflictDoUpdate/Nothing + returning 判断 created）

### 3. 跨步骤事务原子性

- [ ] 多步骤 mutate（如 ensure + create + update + emit）是否在同一事务内
- [ ] 中间步骤失败时是否回滚已执行的 mutate（而非留下脏数据）
- [ ] 外部资源调用（API / sandbox 创建）是否用「占位 + 回填」模式：先 INSERT 占位行 → 调外部 → UPDATE 回填结果
- [ ] 外部资源调用失败时占位行是否标记为 failed（而非删除，保留审计痕迹）

**案例**：yonder PW-BUG-064（sandbox ensure 跨 6 步无事务 + 无唯一约束，并发导致沙箱泄漏；改 upsertSandboxPlaceholder 占位模式 + 仅 created=true 才调 provider.create）

### 4. 幂等性 + 唯一约束兜底

- [ ] callback / webhook 入口是否幂等（重复回调不重复入账 / 不重复创建）
- [ ] 幂等键是否落到 DB 唯一约束（uq_credit_tx_idempotency 等），而非仅靠应用层 check-then-act
- [ ] 服务层是否 catch unique constraint error 后 re-find 走幂等返回（而非抛 500）
- [ ] 部分失败重试时是否重新执行关键步骤（如扣费），而非跳过（idempotencyKey 兜底防双扣）

**案例**：yonder PW-BUG-054（wechatCallback createUserWithParticipant 无事务无 catch，并发抛错）、PW-BUG-060（billing handleCallback topup 无 catch，并发回调抛 500）、PW-BUG-063（credit report 部分失败后重试不重新扣费）

### 5. 唯一约束 DB 兜底

- [ ] 业务上唯一的字段（如 main chat session、agent group_share_code）是否在 schema 加 UNIQUE 索引
- [ ] partial unique index（WHERE kind='main' / WHERE field IS NOT NULL）是否用于可选唯一字段
- [ ] 应用层 check-then-act 是否仍有 DB 唯一约束兜底（双层防护）
- [ ] 数据清理脚本是否在加 UNIQUE 前删除重复行（避免加索引失败）

**案例**：yonder PW-BUG-056（ensureMainChatSession 跨 6 步无事务 + 无唯一约束兜底，并发创建多个 main session；加 uq_agent_chat_sessions_main partial unique index + 服务层 catch + re-find）

## 扫描方法

1. **Grep `await.*repo\.\(count\|find\|list\)`** 后接 `await.*repo\.\(insert\|update\|topup\|addMember\)`：找 check-then-act 模式
2. **Grep `SELECT.*FROM.*\n.*if \(existing\)`** 或 Grep `const \[existing\] = await db\.select`：找 SELECT-then-INSERT upsert
3. **Grep `db\.transaction`**：找已有事务，反向确认未在事务内的 mutate 是否漏了
4. **Grep `TODO.*并发\|并发.*后续\|race.*condition`**：找开发已知但未修的并发竞态
5. **Grep `onConflictDoUpdate\|onConflictDoNothing`**：确认 upsert 用了原子语义
6. **Grep `for\('update'\)\|FOR UPDATE`**：确认关键 mutate 路径有行锁
7. **Grep `uniqueIndex\|UNIQUE INDEX`** 在 schema：确认业务唯一字段有 DB 兜底
8. **逐文件 Read service 层**：跨方法 mutate 流程是否漏事务

## 产出格式

扫描报告含：

1. **扫描摘要**：候选位置数 / confirmed bug 数 / P0/P1/P2/P3 分布 / rejected 数（含理由）
2. **候选位置清单**：表格（文件:行 / 模式类型 / 当前处理 / 风险评估 / confirmed/rejected）
3. **confirmed bug 详情**：每个 bug 含 reproduceSteps / expected / actual / fixSuggestion
4. **通用修复模式**：归纳可复用的修复模板（如「FOR UPDATE 串行化」「占位 + 回填」「onConflictDoUpdate」）
5. **正面对照**：项目中已有的正确实现（如 upsertDevice 用 onConflictDoUpdate）作为参考
6. **新 bug 上报**：P1 单独上报，P2/P3 汇总

## yonder 案例参考

- 报告：`PW-SCAN-concurrency-safety.md`
- 触发 bug：自主扫描发现（先跑 PW-BUG-056 ensureMainChatSession）
- 发现的 bug：
  - P1：PW-BUG-056（ensureMainChatSession 跨 6 步无事务）、PW-BUG-064（sandbox ensure 占位 + 回填）
  - P2：PW-BUG-055（maybeRewardReferrer 超发）、PW-BUG-059（joinByInviteCode 超员）、PW-BUG-063（credit report 不重新扣费）
  - P3：PW-BUG-054（wechatCallback 无 catch）、PW-BUG-057（4 个 upsert SELECT-then-INSERT）、PW-BUG-060（handleCallback 无 catch）
- 扫描规模：11 候选位置 / 8 confirmed / 3 rejected
- 关键反模式：「check-then-act 不在事务内」「SELECT-then-INSERT 而非 ON CONFLICT」「跨步骤无占位 + 回填」
- 修复策略：
  - check-then-act → 下沉到 repo 单事务 SELECT FOR UPDATE 串行化（tryRewardReferrerTopup / tryAddMemberWithLimit）
  - SELECT-then-INSERT → onConflictDoUpdate / onConflictDoNothing + returning 判断 created
  - 跨步骤外部资源 → 占位 + 回填（upsertSandboxPlaceholder）
  - 幂等兜底 → DB 唯一约束 + 服务层 catch unique error + re-find 走幂等返回
