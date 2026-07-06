# product-walker 产品规约

> 编号：001-product-walker
> 状态：draft
> 创建：2026

## 1. 概述

product-walker 是一个面向 AI agent 的「产品体验」Skill 集合。它让 agent 能像真人产品体验师一样，
对一个有 UI/API 的产品做端到端的体验测试，输出结构化的 bug 报告和体验缺陷清单。

### 1.1 设计目标

- **自主性**：agent 给定目标模块后，能自己拆解、自己走路径、自己上报，无需人工逐步指挥
- **完整性**：通过 4 视角查漏算法，覆盖真人体验师容易遗漏的盲区
- **可信性**：bug 必须经过验证 agent 复现确认，排除误报和过度设计
- **可修复**：confirmed 的 bug 由 fixer agent 按 TDD 纪律修复并 commit
- **宿主无关**：任何项目都能装，不改宿主代码（除非 fixer 在修复）

### 1.2 与 spec-kit 的关系

[spec-kit](https://github.com/github/spec-kit) 把「写规约」做成 skill；
product-walker 把「体验产品」做成 skill。两者正交可叠加。

## 2. 用户故事

### US-1：主 agent 拆解模块

> 作为开发者，我希望对 agent 说「体验 yonder 的 auth 模块」，
> agent 就能把 auth 模块拆成若干可体验的路径（登录、注册、忘记密码、会话过期、多设备互踢等），
> 并把每条路径写成结构化 JSON，方便 diff 和追溯。

验收：
- 输出 `paths/PW-AUTH-*.json`，每条路径含 id/name/goal/steps/expected
- 路径数量 ≥ 模块可见入口数
- 路径 id 单调递增、全局唯一

### US-2：子 agent 并发跑路径

> 作为开发者，我希望 orchestrator 把每条路径派给一个 explorer sub-agent，
> 多个 explorer 并发执行（每个走自己的浏览器实例），
> 每个 explorer 走完路径后输出一份 session 记录和可能上报的 bug。

验收：
- 每条路径对应一个 `sessions/PW-SESS-*.json`
- session 记录每一步的实际观察、截图路径、DOM 快照
- 并发不互相干扰（不同 driver 实例、不同数据目录）

### US-3：4 视角查漏

> 作为开发者，我希望 orchestrator 派 hunter sub-agent，
> 从空上下文出发（不看已生成的路径），用 4 种视角重新审视模块，
> 找出主清单遗漏的路径（多任务切换、刷新窗口、断网恢复、跨模块跳入、参数变体等）。

验收：
- hunter 输出的新路径与已有路径查重（相似度 > 80% 不算新）
- 4 视角各自至少产出 1 条候选路径或显式声明「该视角无遗漏」
- hunter 不被已有路径框住（从空上下文启动）

### US-4：bug 闭环

> 作为开发者，我希望 explorer 上报的 bug 不直接进修复，
> 而是先经 verifier 验证（是否真实、可复现、严重度、ROI），
> confirmed 的 bug 才派 fixer 按 TDD 修复并 commit，
> rejected 的 bug 标注理由留档。

验收：
- 每个 bug 走完 `reported → reproducing → confirmed/rejected → fixing → fixed/closed` 状态机
- rejected bug 必须有 verdict.reason
- fixer 修复时必须先写失败测试再改实现，不能跳过 TDD

## 3. 体验路径（Path）规约

路径是 product-walker 的核心输入。一条路径描述「agent 应该怎么走这个产品的某个流程」。

### 3.1 JSON 结构

详见 `schemas/path.ts`，关键字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 形如 `PW-AUTH-001`，全局唯一，单调递增 |
| `name` | string | 人类可读名称 |
| `module` | string | 所属模块 |
| `goal` | string | 体验目标（一句话） |
| `perspective` | enum | 视角：happy/real-user/cross-module/external-env/variant |
| `prerequisites` | array | 前置条件（auth/data/env/state） |
| `steps` | array | 步骤序列，每步含 action/target/expected |
| `expectedOutcome` | string | 整条路径的期望结果 |
| `metadata` | object | createdAt/createdBy/version |

### 3.2 路径命名

- id 前缀 `PW-`，模块缩写大写，序号三位补零：`PW-AUTH-001`、`PW-CHAT-042`
- 模块缩写用大写英文，不超 8 字符

### 3.3 视角枚举

| perspective | 含义 | 由谁生成 |
|-------------|------|---------|
| `happy` | 主流程（60 分基线） | orchestrator |
| `real-user` | 真实用户场景 | hunter 视角 1 |
| `cross-module` | 跨模块跳入 | hunter 视角 2 |
| `external-env` | 外部环境干扰 | hunter 视角 3 |
| `variant` | 已有路径变体 | hunter 视角 4 |

## 4. 体验会话（Session）规约

会话是 explorer 沿路径走的过程记录，是 bug 的证据来源。

### 4.1 关键字段

详见 `schemas/session.ts`，要点：

- `status`: init/running/paused/completed/failed
- `currentStep`: 当前走到哪一步
- `steps[]`: 每步的实际观察、截图、DOM 快照、时间戳
- `interventions[]`: agent 自主介入记录（reason/action/result）

### 4.2 自主介入

explorer 走路径时允许「按人的直觉」介入：
- 看到不合理的 UI 主动点一下试试
- 发现某步骤走不通时换条路
- 发现可疑行为时主动截图 + 抓 DOM

每次介入必须在 `interventions[]` 记录 reason/action/result，便于事后审计。

## 5. bug 生命周期

```
reported → reproducing → confirmed ─┐
                     └→ rejected    │
                                   fixing → fixed → closed
```

### 5.1 状态定义

| 状态 | 含义 | 进入条件 |
|------|------|---------|
| `reported` | explorer 刚上报 | explorer 发现异常 |
| `reproducing` | verifier 正在复现 | verifier 接单 |
| `confirmed` | 已复现，待修 | verifier 复现成功 |
| `rejected` | 误报/过度设计/不值得修 | verifier 判定 |
| `fixing` | fixer 正在修 | fixer 接单 |
| `fixed` | 已修复 | fixer 提交 + 测试绿 |
| `closed` | 已确认修复 | 修复后回归通过 |

### 5.2 字段

详见 `schemas/bug.ts`。关键字段：
- `severity`: P0(阻断)/P1(影响)/P2(体验)/P3(美观)
- `category`: data/ui/interaction/performance/crash/other
- `verdict`: { decision, reason, reproducedBy, reproducedAt }
- `metadata.endpoints`: 涉及的端（web/admin/desktop/server）

## 6. 4 种视角详述

### 6.1 用户真实场景视角

模拟真人在使用产品时的真实场景：
- **多任务切换**：用户开了几个 tab，在 tab 间切换
- **刷新窗口**：用户在某个流程中间刷新页面
- **缓存 bug**：登录态过期、缓存数据与服务端不一致
- **网络抖动**：请求超时、断网恢复
- **断电恢复**：浏览器崩溃后重开

### 6.2 跨模块跳入视角

用户不一定从模块入口进入，可能直接跳到流程中间：
- 通过书签直接打开某个深层页面
- 通过分享链接跳到某个会话/文档
- 通过 URL 参数进入某状态
- 检查这种跳入是否需要前置数据，缺失时的兜底

### 6.3 外部环境视角

外部环境变化对产品的影响：
- 服务端数据变动（其他人改了数据，本端没刷新）
- 系统通知（推送、邮件链接回跳）
- 其他 IM 消息进入打断当前流程
- 系统主题切换/时区变化

### 6.4 迭代延伸视角

从已有路径衍生变体：
- 参数变（不同输入值、边界值、空值）
- 顺序变（步骤调换、跳过某步）
- 组合变（多条路径串联）
- 重复变（连续触发同一操作）

## 7. 浏览器控制抽象

### 7.1 三种 driver

| driver | 用途 | 状态 |
|--------|------|------|
| `playwright` | 内置浏览器，无副作用，CI 友好 | 完整实现 |
| `cdp` | 接管用户已开的 Chrome（端口 9222），测真实环境 | 骨架 |
| `tauri` | Tauri 桌面端 WebView2 | 骨架 + TODO |

### 7.2 统一接口

所有 driver 实现 `BrowserDriver` 接口（见 `runtime/browser/driver.ts`）：

```typescript
interface BrowserDriver {
  launch(): Promise<void>
  goto(url: string): Promise<void>
  click(selector: string): Promise<void>
  type(selector: string, text: string): Promise<void>
  screenshot(): Promise<Buffer>
  domSnapshot(): Promise<string>
  consoleErrors(): Promise<string[]>
  networkErrors(): Promise<string[]>
  close(): Promise<void>
}
```

## 8. 元数据规约

所有数据（path/session/bug/report）都带 `metadata` 字段：

| 字段 | 说明 |
|------|------|
| 涉及端 | web/admin/desktop/server |
| 版本 | 宿主项目版本号 |
| 模块 | 模块名 |
| 路径 | 关联的 pathId |
| agent id | 执行的 agent 标识 |
| 时间戳 | ISO8601 |

## 9. 非功能需求

- **并发安全**：多 agent 并发读写文件时用文件锁（`.lock`）防冲突
- **幂等**：重跑同一路径不产生重复 bug（按 reproduceSteps 查重）
- **可观测**：每一步都带时间戳和 agent id，可追溯
- **零侵入**：不修改宿主项目代码（fixer 修复时除外）
