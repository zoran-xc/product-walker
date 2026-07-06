# product-walker

> 让 AI agent 像真人产品体验师一样，自主走遍产品全部路径、发现 bug、汇报体验缺陷。

## 项目定位

product-walker 是一个**开源 Skill 集合**（类似 [spec-kit](https://github.com/github/spec-kit)），
让任何 AI agent（Claude Code / Cursor / Codex 等）能像真人产品体验师那样，
对一个有 UI/API 的产品做端到端体验测试：拆解模块 → 走遍路径 → 发现 bug → 验证 → 修复 → 汇报。

它的设计哲学与 spec-kit 一致：**规约驱动 + Skill 化**。
spec-kit 把「写规约」做成 skill；product-walker 把「体验产品」做成 skill。
两者可以叠加使用——先用 spec-kit 写规约，再用 product-walker 验证实现是否符合规约。

## 核心特点

- **主从编排**：主 agent（orchestrator）拆解模块 → 多个子 agent 并发体验不同路径
- **4 视角查漏**：用户真实场景 / 跨模块跳入 / 外部环境 / 迭代延伸，从空上下文出发防止盲区
- **bug 闭环**：探索 agent 上报 → 验证 agent 复现/排除误报 → 修复 agent 按 TDD 自动 commit
- **多端控制**：Playwright 内置 / CDP 接管真实浏览器 / Tauri 桌面端，统一抽象为 BrowserDriver
- **规约先行**：所有路径、会话、bug、报告都是 JSON 结构化数据，可 diff、可追溯
- **宿主无关**：任何有 UI/API 的项目都能装，不改宿主项目代码（fixer 修复时才动宿主代码）

## 安装

### 方式一：git clone（推荐，方便升级）

```bash
git clone https://github.com/zoran-xc/product-walker.git
cd product-walker
npm install
```

然后在你的项目里引用 skill：

```bash
# Claude Code: 在 ~/.claude/skills/ 或项目 .claude/skills/ 下软链
ln -s /path/to/product-walker/skills/product-walker-orchestrator .claude/skills/product-walker-orchestrator

# Cursor: 在 .cursor/skills/ 下软链（同理）
# Codex: 按 codex skill 加载约定引用
```

### 方式二：npm install（仅 runtime + schema，不含 skill 文档）

```bash
npm install product-walker --save-dev
```

skill 文档仍需 git clone 获取（因为 skill 是给 agent 读的 markdown，不是运行时依赖）。

## 快速开始

### 第 1 步：装依赖

```bash
cd product-walker
npm install
# Playwright 装浏览器内核
npx playwright install chromium
```

### 第 2 步：在你的项目里创建 paths/ 目录

在你的项目根目录创建 `product-walker/paths/`，写路径定义（参考 `templates/paths/example-path.json`）：

```
your-project/
├── product-walker/
│   ├── paths/           # 体验路径（你写）
│   ├── sessions/        # 体验会话（agent 自动生成）
│   ├── bugs/            # bug 记录（agent 自动生成）
│   └── reports/         # 聚合报告（agent 自动生成）
```

把 `product-walker/` 加入你项目的 `.gitignore`（除非你想把测试记录入库）。

### 第 3 步：跑主 orchestrator

在 agent 会话里说：

> 用 product-walker-orchestrator skill 体验 yonder 的 auth 模块。

主 agent 会自动：枚举入口 → 生成候选路径 → 派 explorer 走 → 派 hunter 查漏 → 派 verifier 验证 → 派 fixer 修复 → 输出报告。

## Skill 列表（6 个）

| Skill | 触发场景 | 职责 |
|-------|---------|------|
| `product-walker-orchestrator` | 用户要体验/测试某模块 | 主控编排，拆模块派子 agent |
| `product-walker-explorer` | orchestrator 派单 | 沿一条路径走，记录 session，上报 bug |
| `product-walker-hunter` | orchestrator 派单查漏 | 4 视角找漏网之鱼路径 |
| `product-walker-verifier` | orchestrator 收到 bug | 验证 bug 真实性/可复现/严重度 |
| `product-walker-fixer` | bug confirmed | 定位源码，按 TDD 修复并 commit |
| `product-walker-index` | 用户问有哪些 skill | 索引/帮助 |

调用关系：

```
用户调 orchestrator
  → 派发 explorer（每路径 1 个，并发）
  → 派发 hunter（查漏，可多轮）
  → 收 bug → 派 verifier（每 bug 1 个）
  → confirmed → 派 fixer
  → 聚合报告
```

## JSON Schema 列表

所有数据结构用 [zod](https://zod.dev) 表达，导出类型，可被 agent 和 runtime 共用。

| Schema | 文件 | 用途 |
|--------|------|------|
| `pathSchema` | `schemas/path.ts` | 体验路径定义（输入） |
| `sessionSchema` | `schemas/session.ts` | 体验会话记录（过程） |
| `bugSchema` | `schemas/bug.ts` | bug 记录 + 验证结论 |
| `reportSchema` | `schemas/report.ts` | 聚合报告 |

## Runtime API

runtime 提供 TypeScript 实现，供 skill 调用：

| 模块 | 路径 | 用途 |
|------|------|------|
| `BrowserDriver` 接口 | `runtime/browser/driver.ts` | 浏览器控制抽象层 |
| `PlaywrightDriver` | `runtime/browser/playwright-driver.ts` | Playwright 实现 |
| `CDPDriver` | `runtime/browser/cdp-driver.ts` | CDP 接管真实 Chrome |
| `TauriDriver` | `runtime/browser/tauri-driver.ts` | Tauri 桌面端（骨架） |
| `createDriver` | `runtime/browser/index.ts` | 工厂函数 |
| storage helper | `runtime/storage.ts` | 读写 path/session/bug/report |
| CLI | `runtime/cli.ts` | `product-walker init/run/report` |

## 许可证

MIT，见 [LICENSE](./LICENSE)。

## 适合的项目类型

任何有 UI 或 API 的项目都能用：

- Web 应用（SPA / SSR）
- 桌面应用（Tauri / Electron）
- 后台管理系统
- 移动端 H5
- 有 HTTP API 的服务端（用 explorer 直接打 API，不走 UI）

不适合的：

- 纯 CLI 工具（没有 UI 可走）
- 实时音视频流（路径无法结构化）
- 需要硬件外设的项目（除非 driver 适配）

## 与 spec-kit 的关系

[spec-kit](https://github.com/github/spec-kit) 解决「怎么把需求写成规约」；
product-walker 解决「怎么验证实现符合规约 + 找出规约没覆盖的体验缺陷」。
两者正交，可叠加：spec-kit 写规约 → product-walker 验证体验。
