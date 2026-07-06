---
name: "product-walker-explorer"
description: "体验探索员 - 沿一条路径走产品，记录 session，上报 bug"
argument-hint: "<path.json 路径>，例如：product-walker/paths/PW-AUTH-001.json"
compatibility: "需要 product-walker runtime 的 Playwright driver（或 cdp/tauri）"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-explorer

> 体验探索员。沿一条 path.json 走产品，以真人产品体验师视角观察，记录 session，上报 bug。

## 何时触发

由 orchestrator 派单时触发。输入一条路径定义文件路径。

## 输入

- 一条 `path.json` 的路径（如 `product-walker/paths/PW-AUTH-001.json`）
- 可选：driver 类型（默认 `playwright`，支持 `cdp` / `tauri`）
- 可选：agent id（用于 session 记录）

## 执行流程（6 步）

### 第 1 步：读路径定义，理解目标

用 Read 读 `path.json`，理解：
- 这条路径的 `goal`（体验目标）
- `prerequisites`（前置条件，如需要登录态、测试数据）
- `steps`（步骤序列，每步的 action / target / expected）
- `expectedOutcome`（整条路径走完的期望结果）

### 第 2 步：选择并启动 driver

默认用 Playwright driver。调用 `runtime/browser` 的 `createDriver('playwright', { headless: false })`。
- 调试时建议 `headless: false` 看实际操作
- CI 跑时用 `headless: true`
- 若 orchestrator 指定 `cdp`，连接用户已开的 Chrome（端口 9222）
- 若指定 `tauri`，目前会抛「未实现」（骨架阶段）

### 第 3 步：维护 session.json（体验脚本）

在 `product-walker/sessions/PW-SESS-<pathId>.json` 维护会话记录。**每走一步前更新 status**：

```json
{
  "id": "PW-SESS-001",
  "pathId": "PW-AUTH-001",
  "agentId": "explorer-1",
  "status": "running",
  "driver": "playwright",
  "currentStep": "s2",
  "steps": [
    { "stepId": "s1", "status": "done", "actual": "登录页正常加载", "screenshot": "screenshots/PW-SESS-001-s1.png", "timestamp": "2026-07-06T10:00:00Z" },
    { "stepId": "s2", "status": "running", "actual": "", "timestamp": "2026-07-06T10:00:05Z" }
  ],
  "interventions": [],
  "startedAt": "2026-07-06T10:00:00Z"
}
```

**session.json 维护规则**：
- 走每一步前：把该步 status 设为 `running`，写入文件
- 走完后：把 status 设为 `done`（或 `failed`/`skipped`），填 `actual`（实际观察），写截图路径，写回文件
- 这样即使中途崩溃，也能从 session.json 看到走到哪一步
- 走完整条路径：把顶层 `status` 设为 `completed`，填 `completedAt`

### 第 4 步：以人的视角观察

走每一步时，不只是机械执行，要像真人产品体验师那样观察：
- **数据展示对不对**：列表里的数据是否正确、是否有时序错乱、空数据态是否合理
- **UI 正常不**：布局有没有错位、loading 是否卡住、错误提示是否友好
- **交互合理不**：按钮是否可点、表单校验是否到位、快捷键是否生效

发现可疑行为时，允许**自主介入**（见下一步）。

### 第 5 步：发现 bug → 写 bug.json + 截图 + DOM

发现异常时，立刻：
1. 截图：`screenshot()` → 存 `product-walker/screenshots/PW-BUG-NNN-01.png`
2. DOM 快照：`domSnapshot()` → 存 `product-walker/dom/PW-BUG-NNN-01.html`
3. 收集 console 错误：`consoleErrors()`
4. 收集网络错误：`networkErrors()`
5. 写 `product-walker/bugs/PW-BUG-NNN.json`：

```json
{
  "id": "PW-BUG-001",
  "sessionId": "PW-SESS-001",
  "pathId": "PW-AUTH-001",
  "title": "登录后跳转到空白页",
  "severity": "P1",
  "category": "ui",
  "description": "点击登录后跳转到 /dashboard，但页面空白，console 报 React 渲染错误",
  "reproduceSteps": ["打开 /login", "输入 test@example.com / password123", "点击登录按钮"],
  "expected": "跳转到 /dashboard 并显示会话列表",
  "actual": "页面空白，console 报错",
  "screenshots": ["screenshots/PW-BUG-001-01.png"],
  "domSnapshot": "dom/PW-BUG-001-01.html",
  "consoleErrors": ["Uncaught TypeError: Cannot read properties of undefined"],
  "networkErrors": [],
  "status": "reported",
  "metadata": { "module": "auth", "endpoints": ["web"], "versions": ["0.1.0"], "reportedAt": "2026-07-06T10:00:10Z", "reportedBy": "explorer-1" }
}
```

bug id 用 `nextId('PW-BUG', 'bugs')` 生成，保证单调递增。

**自主介入**：走路径时若发现可疑 UI（比如看到某按钮文案可疑），可以主动点一下试试。每次介入在 session.json 的 `interventions[]` 记录：
```json
{ "reason": "看到「删除」按钮无确认提示，想验证", "action": "点击删除按钮", "result": "直接删除了，无确认，疑似 bug，已上报 PW-BUG-002" }
```

### 第 6 步：走完路径 → 写单路径小结

走完所有步骤后，写 `product-walker/reports/PW-RPT-<pathId>.md`：
- 路径名称、目标
- 走了哪些步骤、跳过/失败了哪步
- 发现几个 bug（列出 bug id + 标题）
- 体验感受（流畅度、UI 问题、建议）

把顶层 session.status 设为 `completed`（或 `failed` 若有步骤走不通）。

## 关键约束

- **不改宿主项目代码**：只读不写宿主代码，修复交给 fixer
- **不删 bug 数据**：即使判断是误报，也保留 bug.json，让 verifier 判定
- **不跳过步骤**：每一步都要走，走不通标记 `failed` 并说明原因
- **每步留证**：每步至少留 actual 文字描述；发现 bug 必留截图 + DOM
- **session.json 实时更新**：不要走完才一次性写，要边走边写（崩溃可恢复）

## 与其他 skill 的关系

- 上游：`product-walker-orchestrator` 派单
- 下游：上报的 bug 由 `product-walker-verifier` 验证
- hunter 产出的新路径会再派给本 skill 走一遍
