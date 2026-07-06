# 日志脱敏扫描清单

> 横向扫描所有 logger 调用 + console 调用 + 错误响应，找出敏感字段明文进日志 / 控制台的违规。
>
> **触发信号**：发现 1 个 logger 调用打印用户输入或 token → 全代码库扫描同类模式。

## 何时触发

- 发现某 logger.info / logger.error 直接打印 req.body / req.headers / req.query → 触发日志脱敏扫描
- 发现某 logger 打印 verification code / password / apiKey / token 明文 → 触发 PII 扫描
- 发现某 console.log / console.warn / console.error 在生产代码路径（非 DEV guard）→ 触发 console 卫生扫描
- 发现某错误响应 message 含敏感字段 → 触发响应脱敏扫描

## 检查项

### 1. logger 配置层

- [ ] fastify / express logger 配置含 `redact` 字段（pino redact 配置）
- [ ] redact 覆盖 `req.headers.authorization` / `req.headers.cookie` / `req.body.password` / `req.body.token` / `req.query.token`
- [ ] req serializer 去掉 query（防 JWT 进日志：`?token=xxx`）
- [ ] redact 后用 `[Redacted]` 占位，不能完全删除字段（保留字段名供排查）

**案例**：yonder PW-BUG-030（fastify logger 零 redact 配置 → JWT 明文进日志；自定义 req serializer 保留 query → JWT 进飞书告警）

### 2. PII 字段脱敏

- [ ] 所有 logger 调用打印手机号必脱敏（如 `maskTarget(target)` → `138****1234`）
- [ ] 所有 logger 调用打印 email 必脱敏（如 `maskEmail(email)` → `z***@example.com`）
- [ ] 所有 logger 调用打印 password / verification code / apiKey 必脱敏或完全不打印
- [ ] 第三方 SDK 调用前后不要 logger 打印 raw payload（含 token）

**案例**：yonder PW-BUG-031（DevCodeSender console.log 验证码明文打印）、PW-BUG-032（RealCodeSender 5 处 logger 打印 target 明文）

### 3. 错误响应脱敏

- [ ] 500 错误响应不含 stack trace / 内部实现细节
- [ ] 401 / 403 错误响应用通用信息（如「账号或密码错误」而非「密码错误」防账号枚举）
- [ ] 400 错误响应的 message 不含用户原始输入（防反射型 XSS + 信息泄露）
- [ ] 错误响应独立 `code` 字段供程序化处理，`message` 字段供人类阅读

### 4. console 卫生

- [ ] 生产代码路径的 console.log / console.warn / console.error 必加 `if (import.meta.env.DEV)` 或 `if (process.env.NODE_ENV !== 'production')` guard
- [ ] console.log 不允许打印敏感字段（即便在 DEV guard 下，PII 也要脱敏）
- [ ] dev only 工具脚本（如 mock 数据生成）的 console 不受此约束
- [ ] 测试代码的 console 不受此约束（测试文件本身不应进生产）

**案例**：yonder PW-BUG-034（8 个前端文件 14 处 console.warn/error/info 无 DEV guard → 生产信息泄露）

### 5. 第三方告警脱敏

- [ ] 飞书 / Slack / 钉钉 webhook 告警前必脱敏 req.url（去掉 ?query）
- [ ] 告警 message 不含 JWT / token / apiKey 明文
- [ ] 错误堆栈进告警前截断（防过长 + 防泄露内部文件路径）
- [ ] 告警触发频率限制（防高频告警刷屏 + 防敏感字段高频泄露）

**案例**：yonder PW-BUG-033（notifyAlert 调用前未对 req.url 脱敏 → JWT 作为 query param 进飞书告警）

### 6. 日志保留期 + 访问控制

- [ ] 日志保留期明确（如 30 天 / 90 天），过期自动清理
- [ ] 日志访问需审计（谁在何时查看了哪些日志）
- [ ] 日志存储加密（at rest）
- [ ] 日志传输加密（in transit，TLS）
- [ ] 生产日志不在开发环境复制（防本地泄露）

## 扫描方法

1. **Grep `logger\.(info|warn|error|debug)`**：找所有 logger 调用，逐个检查打印内容
2. **Grep `console\.(log|warn|error|info|debug)`**：找所有 console 调用，判断是否在 DEV guard 内
3. **Grep `req\.(body|headers|query|url)`**：找所有 req 字段引用，判断是否进 logger / console
4. **Grep `maskTarget|maskEmail|redact`**：确认脱敏工具函数覆盖率
5. **Grep webhook / notifyAlert / sendAlert**：找第三方告警调用，判断 message 是否脱敏
6. **Read logger 配置文件**：确认 redact 配置 + req serializer
7. **逐文件判断**：
   - 是否打印敏感字段
   - 是否在 DEV guard 内
   - 是否调用脱敏函数

## 产出格式

扫描报告含：

1. **扫描摘要**：文件数 / logger 调用数 / console 调用数 / 违规数 / 按类型分布
2. **违规清单**：表格（文件:行 / 类型 / 当前打印内容 / 风险 / 建议）
3. **PII 字段分布**：哪些字段反复违规（password / phone / token / apiKey 等）
4. **logger 配置审计**：redact 配置是否完整 / req serializer 是否泄漏
5. **console 卫生审计**：生产路径 vs DEV guard 路径分布
6. **新 bug 上报**：高风险（PII 明文 / JWT 进日志）单独上报，低风险（console.info 无敏感）汇总

## yonder 案例参考

- 报告：`PW-SCAN-log-redaction.md`
- 触发 bug：无（横向扫描自主发现）
- 发现的 bug：PW-BUG-030（logger 零 redact + req serializer 保留 JWT query）、PW-BUG-031（DevCodeSender console.log 验证码明文）、PW-BUG-032（RealCodeSender 5 处 logger target 明文）、PW-BUG-033（notifyAlert req.url 未脱敏 JWT 进飞书）、PW-BUG-034（8 文件 14 处 console 无 DEV guard）
- 扫描规模：170 文件 / 8 敏感泄露 / fastify logger 零 redact
- 关键反模式：「logger 配置零 redact」「console.log 直接打印 PII」「req.url 含 JWT query 不脱敏」
- 修复策略：fastify logger 加 redact 配置 + 自定义 req serializer 去掉 query + console 全加 DEV guard + 引入 maskTarget / maskEmail 工具函数
