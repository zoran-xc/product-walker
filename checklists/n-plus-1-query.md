# N+1 查询扫描清单

> 横向扫描所有 service / repo 层，找出 list / 批量场景下的 N+1 查询（循环内调用单条 repo 方法）。
>
> **触发信号**：发现 1 个 service 方法在循环（for / forEach / map）内调用 `await repo.findXxx` 或 `await repo.getXxx` → 全代码库扫描同类模式。

## 何时触发

- 发现某 list 接口（如 `listConversations` / `listSessions` / `listContacts`）在循环内查关联实体 → 触发 list N+1 扫描
- 发现某 service 方法 `for (const x of rows) { await repo.find(x.id) }` → 触发循环 N+1 扫描
- 发现测试用例 mock 了 N 个关联实体但仅断言单条，未覆盖 50+ 条性能场景 → 触发批量场景扫描
- 发现 DB 慢查询日志显示某 list 接口 round-trip 数 = N × 关联实体数 → 触发 round-trip 扫描
- 发现 list 接口响应时间随数据量线性增长（P50 / P95 / P99 偏离）→ 触发性能基线扫描

## 检查项

### 1. 循环内单条查询（典型 N+1）

- [ ] list 接口内是否存在 `for ... { await repo.findById(id) }` 模式
- [ ] list 接口内是否存在 `rows.map(async (r) => await repo.find(r.id))` 模式（即使 Promise.all 也仍是 N round-trip）
- [ ] 循环内单条查询是否能合并为 `repo.findByIds(ids)` 一次 IN 查询
- [ ] 循环内 count 查询是否能合并为 `repo.countBatch(conditions)` 一次 GROUP BY 查询

**案例**：yonder PW-BUG-080（ConversationService.list 50 会话 231 次串行查询，含 findMember + countUnreadMentions + getLastMessage + listMembers + findParticipantById + findAgentByParticipantId）

### 2. 多关联实体预取

- [ ] list 接口是否能一次预取所有关联实体（5-6 路 Promise.all 并行批量查）
- [ ] 关联实体是否能用 Map<id, row> 索引后内存拼装（避免二次查询）
- [ ] DM / 关联对端是否能批量查 participants + agents（一次 IN + 一次 IN）
- [ ] 嵌套关联（如 message.sender → participant → agent）是否能扁平化批量预取

**案例**：yonder PW-BUG-080 修复（5 路批量预取：findMembersForConversations / countUnreadMentionsBatch / getLastMessagesBatch / listMembersForConversations / findParticipantsByIds + findAgentsByParticipantIds）

### 3. 分页 + 关联

- [ ] 分页 list 是否在分页后批量预取关联（避免全量预取）
- [ ] cursor 分页的关联预取是否限定在当前页 ids（避免越界查询）
- [ ] list 接口的 round-trip 数是否与分页 size 无关（常数级，而非 O(N)）
- [ ] 深分页（offset > 10000）是否考虑 cursor 替代 offset

**案例**：yonder SessionService.list（搜索路径 + fetchRecords 批量化，50 会话 101 次查询 → 3 次）

### 4. 批量 upsert / 批量写入

- [ ] 循环 upsert 是否改用 `repo.upsertBatch(rows)` 单 SQL 多值 INSERT ... ON CONFLICT
- [ ] 批量写入是否避免循环 await（用 Promise.all + 单 SQL 或 SQL VALUES 多行）
- [ ] 批量关联更新是否用 `IN (...)` 一次 UPDATE 而非循环单 UPDATE

**案例**：yonder PW-BUG-084（ChannelSyncService.syncMembers 循环 upsertChannelMember，改 upsertChannelMembersBatch 单 SQL 多值 INSERT ON CONFLICT）

### 5. schema / 索引支撑

- [ ] 批量查询的 IN 字段是否有索引（避免 IN 全表扫）
- [ ] 关联字段（如 conversationId / participantId / senderId）是否有复合索引
- [ ] partial index 是否用于过滤条件（如 WHERE kind='main' / WHERE left_at IS NULL）
- [ ] 批量查询是否用 `DISTINCT ON` / `LEFT JOIN ... WHERE IS NULL` 替代子查询

**案例**：yonder PW-BUG-070~079 DB 索引审计（10 个缺索引查询字段补 index）

## 扫描方法

1. **Grep `for \(const .* of `** 后接 `await repo\.find\|await repo\.get\|await repo\.list`：找循环 N+1
2. **Grep `\.map\(async `** 后接 `await repo\.`：找 async map N+1
3. **Grep `Promise\.all\(.*\.map\(async`**：确认即使 Promise.all 也仍是 N round-trip（应改批量）
4. **Grep `await this\.deps\.repo\.`** 在 service 方法内：统计 round-trip 数，判断是否 O(N)
5. **逐文件 Read list 方法**：识别关联实体预取模式
6. **Grep `findByIds\|findBatch\|listBatch\|countBatch`** 在 repo：确认是否已有批量方法支撑
7. **跑 EXPLAIN ANALYZE**：在测试 DB 跑 list 接口的 SQL，看是否 seq scan + 多 round-trip

## 产出格式

扫描报告含：

1. **扫描摘要**：list 接口数 / N+1 位置数 / 平均 round-trip 倍数 / P0/P1/P2 分布
2. **N+1 清单**：表格（service 方法:行 / 循环体内容 / 当前 round-trip / 优化后 round-trip / 严重度）
3. **批量方法建议**：需要新增哪些 repo 批量方法（findXxxForConversations / countXxxBatch / listXxxBatch）
4. **重构方案**：每个 N+1 的批量化重构步骤（预取顺序 / Map 索引 / 内存拼装）
5. **性能对比**：50 条数据下的 before/after round-trip 对比
6. **新 bug 上报**：P0（>100 round-trip）单独上报，P1（10-100）单独上报，P2（<10）汇总

## yonder 案例参考

- 报告：`PW-SCAN-n-plus-1-query.md`
- 触发 bug：自主扫描发现（先跑 PW-BUG-080 ConversationService.list 231 round-trip）
- 发现的 bug：
  - P0：PW-BUG-080（ConversationService.list 50 会话 231 次查询 → 6 次常数级）
  - P1：PW-BUG-081（SessionService.list + fetchRecords 50 会话 101 次查询 → 3 次）
  - P2：PW-BUG-082（ContactService.list 循环 findParticipantById）、PW-BUG-083（listJoinRequests 循环 findParticipantById）、PW-BUG-084（ChannelSyncService.syncMembers 循环 upsertChannelMember）
- 扫描规模：5 list 接口 / 全部命中 N+1
- 关键反模式：「循环内 await repo.findById」「即使 Promise.all 也是 N round-trip」「未用 Map<id,row> 索引」
- 修复策略：
  - repo 层新增 9 个批量方法（findMembersForConversations / countUnreadMentionsBatch / getLastMessagesBatch / listMembersForConversations / findParticipantsByIds / findAgentsByParticipantIds / listAgentSessionEventsBatch / listInvocationsBySessionBatch / upsertChannelMembersBatch）
  - service 层重构为「5-6 路 Promise.all 批量预取 + Map 索引 + 内存拼装」模式
  - 双 Repo 实现对齐（DrizzleRepo + MemoryRepo 共用 runRepoContract 契约测试）
