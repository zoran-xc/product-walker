# product-walker skills 索引

本目录包含 product-walker 的 6 个 skill。每个 skill 是一个子目录，内含 `SKILL.md`（frontmatter + 详细执行说明）。

## Skill 列表

| Skill | 触发场景 | 职责 |
|-------|---------|------|
| [product-walker-orchestrator](./product-walker-orchestrator/SKILL.md) | 用户要体验/测试某模块 | 主控编排，拆模块、派发子 agent、聚合报告 |
| [product-walker-explorer](./product-walker-explorer/SKILL.md) | orchestrator 派单 | 沿一条路径走，记录 session，上报 bug |
| [product-walker-hunter](./product-walker-hunter/SKILL.md) | orchestrator 派单查漏 | 4 视角找漏网之鱼路径 |
| [product-walker-verifier](./product-walker-verifier/SKILL.md) | orchestrator 收到 bug | 验证 bug 真实性/可复现/严重度 |
| [product-walker-fixer](./product-walker-fixer/SKILL.md) | bug confirmed | 定位源码，按 TDD 修复并 commit |
| [product-walker-index](./product-walker-index/SKILL.md) | 用户问有哪些 skill | 索引/帮助 |

## 调用关系图

```
用户调 orchestrator
  │
  ├─ 派发 explorer（每路径 1 个，并发）
  │    └─ 走路径 → 写 session.json → 上报 bug.json
  │
  ├─ 派发 hunter（查漏，可多轮）
  │    └─ 4 视角找新路径 → 写 paths/*.json → 再派 explorer 走
  │
  ├─ 收齐 bug → 派发 verifier（每 bug 1 个）
  │    └─ 7 问验证 → 写 bug.verdict.json（confirmed / rejected）
  │
  ├─ confirmed bug → 派发 fixer（串行，避免 git 冲突）
  │    └─ TDD 修复 → git commit → 改 bug 状态为 fixed
  │
  └─ 聚合报告 → 写 reports/PW-RPT-YYYY-MM-DD.md
```

## 使用方式

1. 把本目录（或其中某个 skill 子目录）软链到你的 agent 配置目录：
   - Claude Code: `.claude/skills/<skill-name>` 或 `~/.claude/skills/<skill-name>`
   - Cursor: `.cursor/skills/<skill-name>`
   - Codex: 按 codex skill 加载约定引用
2. 在 agent 会话里说「用 product-walker-orchestrator 体验 X 模块」即可触发。

## 设计原则

- **主从编排**：只有 orchestrator 直接面向用户，其余 skill 由 orchestrator 派发
- **单一职责**：每个 skill 只做一件事，便于复用和测试
- **数据驱动**：skill 之间通过 JSON 文件（path/session/bug/report）传递，不靠内存状态
- **TDD 纪律**：fixer 严格按宿主项目的测试先行原则，不跳过、不改断言
