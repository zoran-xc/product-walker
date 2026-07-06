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

## 待发现的扫描维度

以下维度尚未在 yonder 项目上触发，但可能在未来项目出现：

- [ ] 国际化 i18n 对齐（文案硬编码 vs t() 调用一致性）
- [ ] 错误处理一致性（try/catch vs Promise.catch vs throw）
- [ ] 日志脱敏（敏感字段是否在日志中脱敏）
- [ ] 权限矩阵扫描（每个 endpoint 是否有 auth middleware）
- [ ] 依赖版本扫描（package.json 是否有已知 CVE 的版本）
- [ ] 环境变量使用扫描（process.env 直接用 vs config 层统一管理）

发现新模式时，agent 应主动追加新清单文件 + 在本目录 README 登记。
