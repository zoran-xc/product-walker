# product-walker 技术方案

> 编号：001-product-walker
> 状态：draft

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  宿主项目（被测产品）                                       │
│  └─ product-walker/          # 数据目录（gitignore）       │
│      ├─ paths/   *.json       # 路径定义                    │
│      ├─ sessions/ *.json      # 体验会话                    │
│      ├─ bugs/    *.json       # bug 记录                    │
│      └─ reports/  *.md        # 聚合报告                    │
└─────────────────────────────────────────────────────────┘
            ▲
            │ 读写
┌───────────┴───────────────────────────────────────────────┐
│  product-walker skill 集合（本仓库）                        │
│                                                            │
│  ┌──────────────┐   派发    ┌──────────────┐               │
│  │ orchestrator │ ────────→│ explorer x N  │               │
│  │  (主控编排)    │           └──────────────┘               │
│  │              │   派发    ┌──────────────┐               │
│  │              │ ────────→│ hunter x M    │               │
│  │              │           └──────────────┘               │
│  │              │   派发    ┌──────────────┐               │
│  │              │ ────────→│ verifier x K  │               │
│  │              │           └──────────────┘               │
│  │              │   派发    ┌──────────────┐               │
│  │              │ ────────→│ fixer x L     │               │
│  └──────────────┘           └──────────────┘               │
│         │                                                  │
│         │ 调用                                              │
│         ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ runtime/                                              │ │
│  │  ├─ browser/  (Playwright/CDP/Tauri driver)           │ │
│  │  ├─ storage.ts (文件读写 helper)                       │ │
│  │  └─ cli.ts    (init/run/report 命令)                  │ │
│  └──────────────────────────────────────────────────────┘ │
│         │                                                  │
│         │ 校验                                              │
│         ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ schemas/  (zod: path/session/bug/report)             │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## 2. 6 个 agent 职责

### 2.1 orchestrator（主控编排器）

- 输入：目标模块或全项目
- 职责：
  1. 枚举模块入口/功能点（用 Read/Grep 扫宿主 spec/code）
  2. 生成候选路径清单（60 分基线，`perspective=happy`）
  3. 派发 N 个 explorer sub-agent，每个领一条路径
  4. 派发 M 个 hunter sub-agent，用 4 视角查漏
  5. 收齐汇报 → 派 verifier 验证每个 bug
  6. confirmed bug → 派 fixer 修复
  7. 聚合报告（`reports/PW-RPT-*.md`）
- 不直接操作浏览器，只做编排

### 2.2 explorer（体验探索员）

- 输入：一个 `path.json`
- 职责：
  1. 读路径定义，理解目标
  2. 选 driver（默认 playwright）
  3. 维护 `session.json`，按路径走 + 自主介入
  4. 以人的视角观察（数据展示、UI、交互）
  5. 发现异常 → 写 `bug.json` + 截图 + DOM 快照
  6. 走完路径 → 写 `report.md`（单路径小结）
- 关键约束：不改宿主代码、不删 bug 数据

### 2.3 hunter（场景猎人）

- 输入：已生成的路径清单 + 目标模块
- 职责：4 视角查漏（详见 spec.md §6）
  - 视角 1：用户真实场景
  - 视角 2：跨模块跳入
  - 视角 3：外部环境
  - 视角 4：迭代延伸
- 输出：新发现的路径 JSON + 查重（相似度 > 80% 不算新）
- 关键约束：从空上下文出发，不被已有路径框住

### 2.4 verifier（bug 验证员）

- 输入：一个 `bug.json`
- 职责：7 问验证（详见 skills/verifier）
  - 真实性 / 可复现 / 误报 / 过度设计 / 影响度 / 严重度 / ROI
- 输出：`bug-verdict.json`（verdict: confirmed/rejected + 理由 + 复现步骤）

### 2.5 fixer（修复工）

- 输入：confirmed bug
- 职责：
  1. 读 bug 复现步骤 + 截图 + DOM
  2. 定位源码（Grep/Read）
  3. 按宿主 TDD 纪律修（先写失败测试 → 改实现 → 跑绿）
  4. 跑测试确认
  5. git add + commit（遵循宿主 commit 规约）
- 关键约束：不能改测试断言让实现过、不能跳过 TDD、不能捎带其他改动

### 2.6 index（索引）

- 触发：用户问「有哪些 skill」或 `/product-walker`
- 职责：列出 6 个 skill + 调用关系图

## 3. 浏览器 driver 架构

### 3.1 统一抽象层

`runtime/browser/driver.ts` 定义 `BrowserDriver` 接口，所有 driver 实现它。
explorer 只面向接口编程，不关心底层是 Playwright 还是 CDP。

### 3.2 Playwright driver（完整实现）

- 用 chromium，headless 默认开
- `launch()` 起浏览器 + context
- `goto/click/type` 转发 Playwright API
- `screenshot()` 返回 Buffer
- `domSnapshot()` 返回 `document.documentElement.outerHTML`
- `consoleErrors()` 监听 `page.on('console')` 和 `page.on('pageerror')`
- `networkErrors()` 监听 `page.on('requestfailed')` 和 4xx/5xx 响应

### 3.3 CDP driver（骨架）

- 连接用户已开的 Chrome（`--remote-debugging-port=9222`）
- 用 `chrome-remote-interface` 或 Playwright 的 `connectOverCDP`
- 适合测「真实环境」（用户已登录态、真实扩展、真实缓存）
- TODO：完整实现

### 3.4 Tauri driver（骨架 + TODO）

- 控制 Tauri 桌面端的 WebView2
- 需要 Tauri 暴露 IPC 桥（宿主项目配合）
- TODO：等 Tauri WebView2 控制协议稳定后实现

### 3.5 工厂

`runtime/browser/index.ts` 的 `createDriver(type, options)` 根据 type 返回对应实例。

## 4. 文件存储布局

```
宿主项目/product-walker/
├─ paths/
│  ├─ PW-AUTH-001.json
│  ├─ PW-AUTH-002.json
│  └─ ...
├─ sessions/
│  ├─ PW-SESS-001.json
│  └─ ...
├─ bugs/
│  ├─ PW-BUG-001.json
│  ├─ PW-BUG-001.verdict.json     # verifier 的结论
│  └─ ...
├─ reports/
│  ├─ PW-RPT-001.md               # 单路径小结
│  └─ PW-RPT-2026-07-06.md        # 聚合报告
├─ screenshots/                   # 截图
│  └─ PW-BUG-001-01.png
├─ dom/                           # DOM 快照
│  └─ PW-BUG-001-01.html
└─ .lock                          # 文件锁
```

## 5. 与宿主项目集成

### 5.1 三种集成方式

| 方式 | 适用 | 优缺点 |
|------|------|--------|
| git submodule | 想锁定版本、能改 product-walker | 升级要 pull；可改上游 |
| npm install | 只用 runtime + schema | skill 文档拿不到 |
| skill 路径引用 | 只用 skill，不动 runtime | 最轻量，推荐起步 |

### 5.2 推荐起步

1. git clone product-walker 到任意位置
2. 在宿主项目的 agent 配置里软链 skill 目录
3. 在宿主项目根建 `product-walker/` 数据目录
4. 跑 orchestrator

## 6. 并发模型

### 6.1 主 agent 串行编排

orchestrator 自己不并发，按顺序：
1. 生成路径清单
2. 派 explorer（这一步并发）
3. 等 explorer 全部回来
4. 派 hunter（这一步并发）
5. 等 hunter 全部回来
6. 派 verifier（这一步并发）
7. 等 verifier 全部回来
8. 派 fixer（这一步可并发，但建议串行避免 git 冲突）
9. 聚合报告

### 6.2 子 agent 并行执行

explorer/hunter/verifier 可以并行，每个起独立 driver 实例、独立数据目录。

### 6.3 文件锁

并发写 `bugs/` 时用 `.lock` 文件：
- 写前检查 `.lock`，存在则等
- 写时创建 `.lock`，写完删
- 用 PID + 时间戳防死锁

## 7. bug 闭环状态机

```
        ┌─────────── reported ───────────┐
        │            │                    │
        │            ▼                    │
        │      reproducing               │
        │       /        \                │
        │      ▼          ▼              │
        │  confirmed    rejected          │
        │      │          │               │
        │      ▼          ▼              │
        │   fixing     (终态)              │
        │      │                          │
        │      ▼                          │
        │    fixed                         │
        │      │                          │
        │      ▼                          │
        └──→ closed (终态)                 │
```

### 7.1 状态转换条件

| 从 | 到 | 条件 |
|----|-----|------|
| reported | reproducing | verifier 接单 |
| reproducing | confirmed | verifier 复现成功 |
| reproducing | rejected | verifier 判定误报/过度设计/不值得修 |
| confirmed | fixing | fixer 接单 |
| fixing | fixed | fixer 提交 + 测试绿 |
| fixed | closed | 修复后回归通过 |

### 7.2 终态

- `rejected`：误报留档，不再流转
- `closed`：bug 完全解决

## 8. 技术选型

| 选型 | 理由 |
|------|------|
| TypeScript | 类型安全，agent 友好 |
| zod | schema 即类型，agent 和 runtime 共用 |
| Playwright | 跨浏览器、API 稳定、headless 友好 |
| vitest | 测试快、ESM 友好 |
| 文件存储（非 DB） | 简单、可 diff、可 git、零依赖 |

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| agent 误报多 | verifier 7 问验证 + 留 rejected 档案 |
| 路径覆盖不全 | hunter 4 视角 + 多轮查漏 |
| 修复破坏其他功能 | fixer 严格 TDD + 跑模块测试 |
| 并发写文件冲突 | 文件锁 + 独立数据目录 |
| 真实环境测出副作用 | CDP driver 用独立 profile，不污染用户数据 |
