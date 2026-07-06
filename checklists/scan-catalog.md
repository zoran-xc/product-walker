# product-walker 扫描清单目录（Scan Catalog）

> 让 AI agent 在任何项目上，按清单决定是否新增关注的内容和扫描的条目。
>
> 本目录是 product-walker 在 yonder 项目上跑过的横向扫描案例沉淀。每个清单文件对应一类扫描维度，含：
> - **何时触发**：什么信号提示 agent 该跑这类扫描
> - **检查项**：可勾选的 checklist（agent 逐项核对）
> - **产出格式**：扫描报告应包含哪些章节
> - **案例参考**：yonder 项目上的实际扫描报告 + 发现的 bug
> - **决策指南**：在新项目应用时，如何判断该跑哪些维度、跳过哪些

## 清单文件

| 文件 | 扫描维度 | 何时触发 | yonder 案例报告 |
|---|---|---|---|
| `design-system-alignment.md` | 设计系统对齐（className 缺 hover/focus/transition） | 发现 1 个 button 缺 hover 类的 bug → 全代码库扫描同类模式 | `PW-SCAN-design-system-alignment.md` |
| `schema-security.md` | schema 安全（.max 缺失 + trim 缺失 + 双源漂移） | 发现 1 个 schema 字段缺 .max 或不 trim → 全 schema 文件扫描 | `PW-SCAN-schema-max-audit.md` + `PW-SCAN-backend-trim-audit.md` |
| `backend-hardening.md` | 后端 hardening（trim 一致性 + 输入校验 + 错误码统一） | 发现 1 个 service 方法不 trim → 全 service 层扫描 | `PW-SCAN-backend-trim-audit.md` |
| `error-handling.md` | 错误处理一致性（catch 静默吞错 + 裸 Error throw + 错误码统一） | 发现 1 个 catch 块静默吞错或 `throw new Error` → 全代码库扫描 | `PW-SCAN-error-handling.md` |
| `auth-matrix.md` | 权限矩阵（auth middleware + IDOR + 限流 + 角色矩阵） | 发现 1 个 endpoint 缺 auth 或未校验所有权 → 全路由扫描 | `PW-SCAN-auth-matrix.md` |
| `log-redaction.md` | 日志脱敏（logger redact + PII 字段 + console 卫生 + 第三方告警） | 发现 1 个 logger 打印敏感字段或 console 无 DEV guard → 全代码库扫描 | `PW-SCAN-log-redaction.md` |
| `i18n-alignment.md` | 国际化对齐（中文硬编码 vs t() 调用一致性） | 发现 1 个组件含硬编码中文且未走 t() → 全代码库扫描 | `PW-SCAN-i18n-alignment.md` |
| `cve-dependency.md` | CVE 依赖扫描（npm audit + 过时依赖 + 版本一致性） | 发现 1 个依赖有 critical/high CVE 或 major 跳跃过时 → 全 package.json 扫描 | `PW-SCAN-cve-dependency.md` |
| `env-usage.md` | 环境变量使用（process.env 散落 + secret fail-fast + .env.example 覆盖率） | 发现 1 处 process.env.XXX 直接用法且不在 config 层 → 全代码库扫描 | `PW-SCAN-env-usage.md` |

## 在新项目应用的工作流

### 1. 识别信号

跑完一轮 product-walker 体验（L1-L4 任一轮）后，hunter sub-agent 上报 bug 时，**审视 bug 是否暴露横向模式**：

- **单点 bug**（如某个按钮文字写错）→ 直接派 fixer 修，无需扫描
- **模式 bug**（如「某 button 缺 hover」「某字段缺 .max」「某 service 不 trim」）→ **触发横向扫描**

### 2. 选择扫描维度

按 bug 模式对照清单文件：

| bug 模式关键词 | 触发扫描 | 清单文件 |
|---|---|---|
| className / hover / focus / 视觉 / 交互反馈 | 设计系统对齐扫描 | `design-system-alignment.md` |
| schema / z.string / .max / trim / 长度上限 | schema 安全扫描 | `schema-security.md` |
| service / trim / 输入校验 / 错误码 / 严格比较 | 后端 hardening 扫描 | `backend-hardening.md` |
| catch / throw new Error / 静默吞错 / 错误工厂 | 错误处理一致性扫描 | `error-handling.md` |
| auth / ownership / IDOR / params.id / 限流 / 角色 | 权限矩阵扫描 | `auth-matrix.md` |
| logger / console.log / req.body / token / PII / redact | 日志脱敏扫描 | `log-redaction.md` |
| 中文 / 硬编码 / t() / i18n / useTranslation / errors.json | 国际化对齐扫描 | `i18n-alignment.md` |
| CVE / npm audit / 过时 / major 跳跃 / 版本不一致 | CVE 依赖扫描 | `cve-dependency.md` |
| process.env / secret / JWT_SECRET / .env.example / config 层 | 环境变量使用扫描 | `env-usage.md` |

### 3. 派扫描 sub-agent

用以下 prompt 模板派 sub-agent：

```
你是扫描 sub-agent，在 <项目路径> 跑「<扫描维度>」横向专项。

## 背景
<bug 摘要>暴露一个模式：<模式描述>。需要横向扫描全代码库找同类违规。

## 扫描目标
<按清单文件的「检查项」逐项扫描>

## 扫描方法
<Grep 关键词 + 提取 + 判断流程>

## 产出
- 扫描报告到 `<项目>/product-walker/reports/PW-SCAN-<维度>.md`
- 违规清单表格（文件:行 / 元素 / 现状 / 缺什么 / 严重度 / 建议）
- 重复模式归纳
- 新 bug 上报（高风险单独上报，低风险汇总）

## 关键约束
- 不修代码（扫描 + 写报告 + 上报 bug）
- 不 commit
- runtime 边界：产出全在 product-walker/ 目录
```

### 4. 沉淀清单

扫描完成后，把发现的检查项追加到对应清单文件的「检查项」章节，并在「案例参考」补本次扫描的报告路径。这样清单会随项目迭代越来越完整。

### 5. 决策跳过

在新项目上，agent 应先读清单文件的「何时触发」章节，判断是否需要跑该维度：

- 项目无设计系统 spec → 跳过设计系统对齐扫描（无对齐基准）
- 项目无 schema 验证层（如纯 Python + 手动校验）→ 跳过 schema 安全扫描
- 项目无 service 层（如纯前端）→ 跳过后端 hardening 扫描
- 项目无错误处理中间件（如纯函数式）→ 跳过错误处理一致性扫描
- 项目无 auth 概念（如纯内部工具）→ 跳过权限矩阵扫描
- 项目无日志系统（如纯客户端）→ 跳过日志脱敏扫描
- 项目无多语言需求（如纯内部工具）→ 跳过 i18n 对齐扫描
- 项目无 npm/依赖管理（如纯 Python / Rust）→ 跳过 CVE 依赖扫描（用对应生态的工具）
- 项目无 env 变量（如纯静态文件）→ 跳过环境变量使用扫描

**跳过时显式声明**「该项目无 X，跳过 Y 扫描」并记录理由，避免遗漏。

## 清单维护原则

- **从真实案例沉淀**：清单检查项必须来自实际扫描发现的 bug，不凭空想象
- **可勾选**：每项检查写成 `[ ]` 格式，agent 可逐项核对
- **附案例**：每项检查附 yonder 项目的 bug ID 作为参考，方便 agent 理解上下文
- **迭代增长**：每次扫描发现新模式就追加，清单只会越来越完整

## 已覆盖的扫描维度（持续增长）

- [x] 设计系统对齐（className 缺 hover/focus/transition）— yonder PW-BUG-017/018/019/020
- [x] schema .max 缺失审计 — yonder PW-BUG-015/023
- [x] schema 双源漂移 — yonder PW-BUG-024
- [x] 后端 trim 一致性 — yonder PW-BUG-014/016/021/022
- [x] 错误处理一致性（catch 静默吞错 + 裸 Error throw）— yonder PW-BUG-025/026
- [x] 权限矩阵（auth middleware + IDOR + 限流）— yonder PW-BUG-027/028/029
- [x] 日志脱敏（logger redact + PII + console 卫生 + 第三方告警）— yonder PW-BUG-030/031/032/033/034
- [x] 国际化 i18n 对齐（中文硬编码 + errors.json key 覆盖）— yonder PW-BUG-035
- [x] CVE 依赖扫描（npm audit + 过时 + 版本一致性）— yonder PW-BUG-040~051
- [x] 环境变量使用（process.env 散落 + secret fail-fast + .env.example 覆盖率）— yonder PW-BUG-052/053

## 待发现的扫描维度

以下维度尚未在 yonder 项目上触发，但可能在未来项目出现：

- [ ] 性能基线扫描（关键 endpoint P95 延迟 / DB 慢查询 / N+1 查询）
- [ ] 数据库索引审计（高频查询字段是否有索引 / 索引是否被使用）
- [ ] 并发安全扫描（共享状态 mutation / 锁粒度 / 死锁风险）
- [ ] API 兼容性扫描（breaking change 检测 / 版本号管理 / 废弃字段处理）
- [ ] 前端性能扫描（bundle size / tree-shaking / code-splitting / lazy load）
- [ ] 数据库迁移安全扫描（migration 文件 / 回滚策略 / schema 漂移检测）
- [ ] 测试覆盖率审计（关键模块覆盖率 / 集成 vs 单元比 / 测试质量）
- [ ] 文档一致性扫描（API 文档 vs 实现一致性 / README vs 实际行为）

发现新模式时，agent 应主动追加新清单文件 + 在本目录 README 登记。
