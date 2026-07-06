# 后端 hardening 扫描清单

> 横向扫描所有 service 层方法，找出输入校验不严 + trim 缺失 + 错误码不统一的违规。
>
> **触发信号**：发现 1 个 service 方法不 trim 或输入校验不严 → 全 service 层扫描。

## 何时触发

- 发现某 service 方法接收用户输入但未 trim → 触发 trim 一致性扫描
- 发现某 service 方法用严格 `===` 比较 string → 触发严格比较扫描
- 发现某 service 方法错误码不统一（部分 400 部分 401）→ 触发错误码一致性扫描
- 发现某 service 方法未做边界值校验（如 seq 单调、幂等键、并发）→ 触发边界扫描

## 检查项

### 1. trim 一致性

- [ ] 所有 service 方法接收的 string 用户输入字段在 schema 层 `.trim()` 或 service 入口 trim
- [ ] account / email / phone / displayName / inviteCode 等关键字段必 trim
- [ ] password 字段**不 trim**（密码含空格是有效字符）
- [ ] 多行文本（content.text / bio / description / systemPrompt）只判 `trim().length === 0` 拦截纯空白，不修改原值落库
- [ ] schema 层 trim 优先于 service 层（DRY + 错误前置）

**案例**：yonder PW-BUG-014（content.text 不 trim）、PW-BUG-016（account 不 trim）、PW-BUG-021（register email 不 trim 写入 DB 致账号孤儿）、PW-BUG-022（changePassword target 不 trim 严格比较失败功能 bug）

### 2. 严格比较扫描

- [ ] service 层所有 `string === string` 比较前，两侧都 trim（或确保来源已 trim）
- [ ] 重点：用户输入字段与 DB 字段比较（如 `target === user.email`）
- [ ] 重点：用户输入字段与查询结果比较（如 `inviteCode === conversation.inviteCode`）

**案例**：yonder PW-BUG-022（changePassword target 严格 === 比较失败）

### 3. 错误码一致性

- [ ] 同类错误返回相同错误码（如「输入为空」统一 400，「未授权」统一 401，「限流」统一 429）
- [ ] service 层抛 AppError 时错误码与 spec 对齐
- [ ] 错误处理中间件覆盖所有 AppError 子类

**案例**：yonder PW-BUG-007（限流触发返回 500 而非 429）

### 4. 边界值校验

- [ ] seq 单调递增（appendMessage 保证 seq 不回退）
- [ ] 幂等键去重（同 idempotencyKey 重复请求不重复落库）
- [ ] 并发控制（乐观锁 / 悲观锁 / SELECT FOR UPDATE）
- [ ] 限流冷却（rate limit 触发后返回 Retry-After）

**案例**：yonder PW-BUG-009（同 idempotencyKey 重复落库）、PW-BUG-007（限流无 Retry-After）

### 5. DB 写入污染

- [ ] 用户输入字段写入 DB 前 trim（避免带空格值落库）
- [ ] 用户输入字段写入 DB 前做格式校验（email regex / phone E.164）
- [ ] 写入 DB 前做长度校验（防超长值截断或报错）
- [ ] 软删可见性（deletedAt IS NULL 过滤）

**案例**：yonder PW-BUG-021（register email 带空格写入 DB 致账号孤儿）

### 6. 输入校验链路完整性

- [ ] schema 层校验 → service 层校验 → DB 约束（NOT NULL / UNIQUE / CHECK）三层防护
- [ ] schema 层是第一道防线（错误前置，返回 400）
- [ ] service 层是第二道防线（业务规则，返回 400/403/409）
- [ ] DB 约束是最后防线（防数据不一致）

## 扫描方法

1. **LS 列全部 service 文件**：
   - `server/src/services/**/*.ts`
   - 含子目录（channel/、llm-translators/、shared/ 等）
2. **逐文件 Read**：识别 service 方法签名 + 方法体内对 string 字段的处理
3. **Grep `.trim()`**：找已有 trim 调用，区分用户输入 trim vs env trim
4. **Grep `===`**：找严格比较，判断是否比较用户输入字段
5. **对每个用户输入字段判断**：
   - 是否 trim（schema 层或 service 层）
   - 是否做格式校验（email/phone/URL）
   - 是否做长度校验
   - 是否进 DB 查询/写入
6. **按风险分类**：
   - 高：用户输入直接进 DB 查询且不 trim
   - 中：用户输入进 DB 写入但不参与查询匹配
   - 低：仅展示用字段

## 产出格式

扫描报告含：

1. **扫描摘要**：service 文件数 / 用户输入字段总数 / 未 trim 字段数 / 按风险分布
2. **违规清单**：表格（文件:行 / service 方法 / 字段名 / 当前处理 / 风险等级 / 建议）
3. **重复模式归纳**：哪些 service 集中缺 trim / 哪些字段类型反复违规
4. **不应 trim 的字段清单**：明确列出 password / 多行文本等特殊字段及理由
5. **修复策略**：推荐 schema 层统一 trim（DRY）vs service 层 trim 的对比
6. **新 bug 上报**：高风险单独上报，同模式违规汇总

## yonder 案例参考

- 报告：`PW-SCAN-backend-trim-audit.md`
- 触发 bug：PW-BUG-014（content.text 不 trim）+ PW-BUG-016（account 不 trim）
- 发现的 bug：PW-BUG-021（register email 写 DB 污染）、PW-BUG-022（changePassword target 严格比较失败）
- 扫描规模：30 service 文件 / ~47 用户输入字段 / 42 处未 trim / 9 高风险
- 关键反模式：「service 层普遍不 trim，只靠 schema 兜底」「必填字段 0 处 trim，可选字段才 trim 回退」
- 修复策略推荐：schema 层统一 `.trim()`（DRY + 错误前置 + 项目已有先例 session.ts:98）
