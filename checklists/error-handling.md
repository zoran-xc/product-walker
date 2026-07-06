# 错误处理一致性扫描清单

> 横向扫描所有 service / route / lib 层，找出错误处理不一致 + 静默吞错 + 错误类型不统一的违规。
>
> **触发信号**：发现 1 个 catch 块静默吞错或 `throw new Error(...)` 直接抛裸 Error → 全代码库扫描同类模式。

## 何时触发

- 发现某 catch 块无 logger 调用、无 rethrow → 触发静默吞错扫描
- 发现某 service / lib 直接 `throw new Error(...)` 而非项目错误工厂（如 `AppError` / `Errors.internal()`）→ 触发错误类型扫描
- 发现某 route handler 用 try/catch 而非统一错误中间件 → 触发错误处理链路扫描
- 发现某 error.message 含用户输入或敏感字段 → 触发错误信息脱敏扫描

## 检查项

### 1. catch 块纪律

- [ ] 所有 catch 块要么 rethrow、要么 logger.error、要么显式标记「已知可忽略」理由
- [ ] 不允许 `catch (e) {}` 空体（即便 e 是 unknown 也要 logger.warn 至少）
- [ ] catch 后续逻辑不能假装成功（如返回 default 值不告知上游）
- [ ] 异步 Promise catch 不能丢（要么 await + try/catch，要么 .catch(logger.error)）

**案例**：yonder PW-BUG-025（createAgentDm catch 静默吞错，DM 创建失败用户无感知）

### 2. 错误类型统一

- [ ] service / lib 层不允许直接 `throw new Error(...)`，必须用项目错误工厂
- [ ] 错误工厂应有 internal() / badRequest() / unauthorized() / forbidden() / notFound() / conflict() 完整覆盖
- [ ] errors.internal() 应自动包装 logger.error + 上下文（不依赖调用方）
- [ ] AppError 子类必须含 code / message / httpStatus / context 字段，供中间件统一序列化

**案例**：yonder PW-BUG-026（agent-model-client.ts 6 处 `throw new Error` 改为 `Errors.internal()`，自动落日志 + 上下文）

### 3. 错误处理链路

- [ ] 所有 route handler 用 async/await + 框架错误中间件，不手动 try/catch + res.status
- [ ] 错误中间件统一序列化 AppError → JSON response（含 code / message / requestId）
- [ ] 500 错误不能向客户端泄漏 stack trace / 内部实现细节
- [ ] 404 / 405 / 401 / 403 由中间件统一处理，不在 handler 内手动 res.status

### 4. 错误信息脱敏

- [ ] error.message 不含 password / token / apiKey / 手机号明文
- [ ] logger.error 时序列化 error 不直接打印 req.body / req.headers
- [ ] 客户端响应的错误信息脱敏（如「账号或密码错误」而非「密码错误」）
- [ ] 错误码（如 VALIDATION_ERROR / UNAUTHORIZED）独立于 message，供客户端程序化处理

### 5. 错误边界覆盖

- [ ] 外部 API 调用必有错误处理（fetch / axios / SDK 调用）
- [ ] DB 操作必有错误处理（事务回滚 + 错误码映射）
- [ ] 第三方服务调用错误需重试 + 熔断 + fallback
- [ ] UI 错误边界（React ErrorBoundary / Vue errorCaptured）覆盖关键路由

**案例**：yonder agent-model-client 调用上游 LLM API 时 6 处直接 `throw new Error`，改为 Errors.internal() 后自动落日志 + 上下文

## 扫描方法

1. **Grep `catch \(`**：找所有 catch 块，逐个检查是否有 logger / rethrow
2. **Grep `throw new Error`**：找裸 Error throw，判断是否应用项目错误工厂
3. **Grep `try \{`**：找 try 块，判断是否在 route handler 内（应在中间件层处理）
4. **Grep `logger\.(error|warn)`**：确认错误日志覆盖率
5. **Grep `res\.status\(`**：找手动 status 调用，判断是否应交给中间件
6. **逐文件 Read**：识别 catch 块体是否为空 / 是否含 logger / 是否 rethrow

## 产出格式

扫描报告含：

1. **扫描摘要**：文件数 / catch 块总数 / throw Error 总数 / 违规数 / 按类型分布
2. **违规清单**：表格（文件:行 / 类型 / 当前处理 / 风险 / 建议）
3. **重复模式归纳**：哪些 service / route 集中违规 / 哪些错误类型反复出现
4. **错误工厂建议**：是否需要新增 internal() / badRequest() 等工厂方法
5. **新 bug 上报**：静默吞错 + 裸 Error 高风险单独上报

## yonder 案例参考

- 报告：`PW-SCAN-error-handling.md`
- 触发 bug：无（横向扫描自主发现）
- 发现的 bug：PW-BUG-025（createAgentDm catch 静默吞错）、PW-BUG-026（agent-model-client 6 处 throw new Error 改 Errors.internal）
- 扫描规模：30+ 文件 / 142 throw / 22 违规
- 关键反模式：「catch 块静默吞错，假装成功」「裸 Error throw 不进日志系统」
- 修复策略：新增 `Errors.internal()` 工厂（自动 logger.error + 上下文）+ 强制 catch 块加 logger
