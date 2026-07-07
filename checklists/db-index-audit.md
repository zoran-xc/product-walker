# 数据库索引审计扫描清单

> 横向扫描所有 repo / service 层 + schema 定义，找出高频查询字段缺索引 / 索引未命中 / 重复索引 / 缺 UNIQUE 兜底等问题。
>
> **触发信号**：发现 1 个 repo 查询方法用 `where(eq(...))` 但该字段在 schema 无 index → 全代码库扫描同类模式。

## 何时触发

- 发现某 repo 查询方法 `db.select().from(...).where(eq(...))` 但 schema 中该字段无 index → 触发缺索引扫描
- 发现某 list 接口在测试 DB 跑 EXPLAIN 显示 seq scan → 触发索引审计
- 发现某业务唯一字段（如 inviteCode / shareCode / main session）无 UNIQUE 约束 → 触发唯一约束兜底扫描
- 发现某高频查询字段（如 createdAt / status / userId）无复合索引 → 触发复合索引扫描
- 发现某 partial 条件查询（如 WHERE status='running' / WHERE left_at IS NULL）无 partial index → 触发 partial index 扫描

## 检查项

### 1. 高频查询字段索引

- [ ] `where(eq(t.field))` 的字段是否有 index（避免全表扫）
- [ ] 外键字段（如 userId / accountId / conversationId / participantId）是否有 index
- [ ] 高频排序字段（如 createdAt DESC / updatedAt DESC）是否有 index
- [ ] 高频过滤字段（如 status / type / kind）是否有 index
- [ ] 复合查询条件（如 (userId, status) / (conversationId, seq)）是否有复合 index

**案例**：yonder PW-BUG-070（invocation.sessionId 缺索引 → listInvocationsBySession seq scan）、PW-BUG-075（invocation.accountId + createdAt 缺复合索引 → 流水分页 filesort）、PW-BUG-079（users.referredBy 缺索引 → countReferrals 全表扫）

### 2. 复合索引顺序

- [ ] 复合索引的字段顺序是否匹配查询条件顺序（equality → range → sort）
- [ ] 是否避免冗余复合索引（如 (a, b) 已有索引，再建 (a) 单字段索引冗余）
- [ ] 复合索引是否覆盖 ORDER BY 字段（避免 filesort）
- [ ] 是否避免过度索引（写多读少场景的索引反而拖慢写入）

**案例**：yonder PW-BUG-074（credit_transactions (account_id, created_at DESC) 缺复合索引 → 流水分页 filesort）、PW-BUG-076（agent_chat_sessions.conversationId 缺索引 → 查会话成员 seq scan）

### 3. Partial index（条件索引）

- [ ] partial 条件查询（WHERE field IS NOT NULL / WHERE status='X'）是否有 partial index
- [ ] 软删除字段（deletedAt IS NULL）的查询是否有 partial index
- [ ] enum 字段高频过滤值（如 status='running'）是否有 partial index
- [ ] partial index 的 WHERE 条件是否与查询条件完全一致

**案例**：yonder PW-BUG-078（sandbox_instances 状态过滤无 partial index → sweepIdle 扫所有行而非仅 running/paused）、PW-BUG-077（notifications.read=false 无 partial index → 未读列表扫全部已读）、PW-BUG-079（users.referredBy 应为 partial WHERE referred_by IS NOT NULL）

### 4. UNIQUE 约束兜底

- [ ] 业务唯一字段（如 inviteCode / shareCode / referralCode / main session）是否有 UNIQUE index
- [ ] 可空字段唯一约束是否用 partial unique index（WHERE field IS NOT NULL，避免 NULL 重复允许）
- [ ] 复合唯一约束（如 (conversationId, participantId) / (channelId, externalGroupId)）是否覆盖业务唯一性
- [ ] 应用层 check-then-act 是否有 DB UNIQUE 兜底（双层防护，参考 concurrency-safety.md）

**案例**：yonder PW-BUG-073（agents.groupShareCode 缺 UNIQUE → 群分享码可重复，跨 Agent 访问风险）、PW-BUG-056（agent_chat_sessions main session 缺 partial UNIQUE → 并发创建多个 main session；加 uq_agent_chat_sessions_main partial unique WHERE kind='main'）

### 5. 索引使用率验证

- [ ] 跑 `EXPLAIN ANALYZE` 确认索引被命中（而非 seq scan）
- [ ] 检查 PG `pg_stat_user_indexes` 确认索引被使用（未使用索引考虑删除）
- [ ] 索引字段是否被查询条件完全匹配（如 partial index WHERE 条件需匹配查询 WHERE）
- [ ] 是否避免在低基数字段（如 boolean / enum < 10 值）单独建索引（用 partial index 替代）

### 6. 迁移文件安全

- [ ] 加 UNIQUE 索引前是否删除重复数据（避免 CREATE UNIQUE INDEX 失败）
- [ ] 大表加索引是否用 `CREATE INDEX CONCURRENTLY`（不锁表）
- [ ] 迁移脚本是否可重入（`CREATE INDEX IF NOT EXISTS`）
- [ ] 迁移脚本是否回滚策略（DROP INDEX IF EXISTS）

**案例**：yonder 0017 迁移文件（加 uq_agent_chat_sessions_main 前先 DELETE 重复 main session 行 + DELETE 重复 group_share_code 行，全部用 `CREATE INDEX IF NOT EXISTS` 可重入）

## 扫描方法

1. **Grep `where\(eq\(`** 在 repo 层：找所有 where 条件，统计字段
2. **Grep `\.orderBy\(`** 在 repo 层：找排序字段，确认有索引
3. **Grep `uniqueIndex\|UNIQUE INDEX`** 在 schema：列出已有 UNIQUE 约束
4. **Grep `index\(`** 在 schema：列出已有 index，对比查询字段
5. **对照表**：把 repo 查询字段 vs schema index 字段做交叉表，找未覆盖字段
6. **跑 EXPLAIN**：在测试 DB 跑高频查询的 EXPLAIN ANALYZE，看是否 seq scan
7. **Grep `db\.select\(\)\.from\(`** + 检查 `.where()` 条件：确认索引覆盖
8. **Grep `WHERE \(.*IS NULL\|WHERE \(.*=.*\)`**：找 partial 条件，确认 partial index

## 产出格式

扫描报告含：

1. **扫描摘要**：repo 查询方法数 / 缺索引字段数 / 缺 UNIQUE 字段数 / 索引冗余数 / P0/P1/P2 分布
2. **缺索引清单**：表格（表名 / 字段 / 查询方法 / 当前状态 / 建议索引类型 / 严重度）
3. **缺 UNIQUE 清单**：表格（表名 / 字段 / 业务唯一性描述 / 当前状态 / 建议 UNIQUE 类型 / 严重度）
4. **迁移脚本**：CREATE INDEX / CREATE UNIQUE INDEX 语句（含数据清理 + IF NOT EXISTS）
5. **schema 更新**：drizzle schema 的 index/uniqueIndex 定义更新
6. **EXPLAIN 验证**：修复前 seq scan → 修复后 index scan 的对比
7. **新 bug 上报**：UNIQUE 缺失（并发安全风险）单独上报，普通缺索引汇总

## yonder 案例参考

- 报告：`PW-SCAN-db-index-audit.md`
- 触发 bug：自主扫描发现（先跑 PW-BUG-070 invocation.sessionId 缺索引）
- 发现的 bug：
  - P1：PW-BUG-070（invocation.sessionId）、PW-BUG-075（invocation account+createdAt 复合）、PW-BUG-073（agents.groupShareCode UNIQUE）、PW-BUG-079（users.referredBy partial）
  - P2：PW-BUG-071（agent_chat_sessions.conversationId）、PW-BUG-074（credit_tx account+createdAt 复合）、PW-BUG-076（同 071 关联）、PW-BUG-077（notifications.read=false partial）、PW-BUG-078（sandbox status partial）
  - P3：PW-BUG-072（channels.pendingState partial）
- 扫描规模：10 个缺索引 bug / 12 条 CREATE INDEX 语句 / 迁移 0017
- 关键反模式：「高频 where 字段无 index」「partial 条件无 partial index」「业务唯一字段无 UNIQUE 兜底」
- 修复策略：
  - schema 加 12 个 index/uniqueIndex 定义（drizzle-orm pg-core）
  - 迁移 0017 含数据清理（DELETE 重复行）+ CREATE INDEX IF NOT EXISTS 可重入
  - partial index 用 `.where(sql`...`)` 语法（drizzle-orm）
  - 复合 index 字段顺序匹配查询（equality → range → sort）
