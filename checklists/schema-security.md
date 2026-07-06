# schema 安全扫描清单

> 横向扫描所有 schema 定义文件，找出缺 .max 上限 + 缺 .trim() + 双源漂移的违规。
>
> **触发信号**：发现 1 个 schema 字段缺 .max 或不 trim → 全 schema 文件扫描。

## 何时触发

- 发现某 `z.string().min(N)` 字段缺 `.max` → 触发 .max 缺失审计
- 发现某用户输入字段不 trim → 触发 trim 一致性扫描（见 `backend-hardening.md`）
- 发现 contracts 与 routes 各定义一份 schema → 触发双源漂移扫描
- 修复某字段时发现「修了 contracts 但路由没用 contracts」→ 漂移信号

## 检查项

### 1. .max 上限缺失

- [ ] 所有用户输入文本字段（password/phone/email/displayName/bio/systemPrompt/message content 等）有 `.max(N)`
- [ ] 所有 OAuth ticket/code/state/redirectUrl 字段有 `.max(N)`
- [ ] 所有 idempotencyKey/cursor 等业务字段有 `.max(N)`
- [ ] 所有 notification title/body 等持久化字段有 `.max(N)`
- [ ] 建议上限：password .max(1024) / phone .max(20) / email .max(255) / displayName .max(64) / bio .max(512) / description .max(2048) / systemPrompt .max(32*1024) / message content .max(16*1024) / URL .max(2048) / idempotencyKey .max(128) / cursor .max(64)

**案例**：yonder PW-BUG-015（passwordLogin.password 缺 .max）、PW-BUG-023（~28 处高风险字段缺 .max）

### 2. .trim() 缺失

- [ ] 所有用户输入 string 字段（非 password/非多行文本）有 `.trim()`
- [ ] schema 层 `.trim()` 优先于 service 层 trim（DRY + 错误前置）
- [ ] password 字段**不加** `.trim()`（密码含空格是有效字符）
- [ ] 多行文本（content.text/bio/description/systemPrompt）**只判** `trim().length === 0`，**不修改原值**落库

**案例**：yonder PW-BUG-014（content.text 不 trim）、PW-BUG-016（account 不 trim）、PW-BUG-021（register email 不 trim 写入 DB）

### 3. 双源漂移

- [ ] 项目有「schema 单一真源」规约（contracts 或 routes 二选一）
- [ ] 若双源存在，逐字段对比两份定义是否一致
- [ ] 重点检查：`.min` / `.max` / `.trim()` / `.regex()` / `.email()` / `.url()` / `.enum()` 是否一致
- [ ] 数组元素约束一致（`shortIdSchema[]` vs 裸 `z.array(z.string())`）
- [ ] 字段命名一致（`displayName` vs `name`）
- [ ] refine 校验一致（routes 多了 refine 而 contracts 没有 → 漂移）

**案例**：yonder PW-BUG-024（8 处漂移，含 wechatStartBodySchema 缺 SSRF regex 高优安全问题）

### 4. SSRF 防护

- [ ] 所有接受 URL 的字段（redirectUri/avatarUrl/uploadUrl 等）用 `.regex(/^https?:\/\/.+/i)` 而非 `.url()`（zod `.url()` 允许 `file://`）
- [ ] 来源：yonder test-retrospective F-3 + PW-BUG-024

### 5. 枚举一致性

- [ ] 枚举字段（status/type/role 等）在 contracts 和 routes 两处定义一致
- [ ] 新增枚举值时同步两处

## 扫描方法

1. **Grep 搜索所有 z.string()**：
   - `packages/contracts/src/**/*.ts`
   - `server/src/routes/**/*.ts`（重点 `schemas.ts`）
   - `server/src/**/*.ts`（找内联 schema）
2. **对每个匹配判断**：
   - 提取整行 schema 定义
   - 检查是否带 `.max(` / `.trim()` / `.regex(`
   - 不带的标记为违规
3. **排除合理例外**：
   - `.enum([])` 枚举豁免
   - `.url()` / `.email()` 已有 format 限制（但仍建议补 .max）
   - 响应字段（DB 行返回）可降级为低风险
4. **双源漂移专项**：
   - 列出所有在 contracts 和 routes 都定义的 schema 概念
   - 逐字段对比约束是否一致
   - 标记漂移风险

## 产出格式

扫描报告含：

1. **扫描摘要**：文件数 / z.string() 总数 / 缺 .max 总数 / 按风险等级分布
2. **违规清单**：表格（文件:行 / schema 名 / 字段名 / 当前约束 / 风险等级 / 建议 .max 值）
3. **schema 漂移专项**：双源定义对比表
4. **重复模式归纳**：哪些 schema 文件集中缺 .max / 哪些字段类型反复违规
5. **新 bug 上报**：高风险单独上报，低风险汇总

## yonder 案例参考

- 报告：`PW-SCAN-schema-max-audit.md` + `PW-SCAN-backend-trim-audit.md`
- 触发 bug：PW-BUG-015（password 缺 .max）
- 发现的 bug：PW-BUG-023（contracts ~28 处缺 .max）、PW-BUG-024（8 处双源漂移含 SSRF 缺失）
- 扫描规模：21 文件 / ~330 处 z.string() / ~265 处缺 .max / 8 处漂移
- 关键反模式：「项目级 .max 习惯缺失」「.max 修复全部被动（只在 bug 修复时补）」
