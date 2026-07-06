---
name: "product-walker-index"
description: "product-walker skill 索引 - 列出全部 skill 和调用关系"
argument-hint: "无参数（或 skill 名查详情）"
compatibility: "无依赖，纯文档查询"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-index

> product-walker 的 skill 索引。用户问「有哪些 skill」或 `/product-walker` 时触发。

## 6 个 Skill

| Skill | 触发场景 | 职责 |
|-------|---------|------|
| `product-walker-orchestrator` | 用户要体验/测试某模块 | 主控编排：拆模块、派子 agent、聚合报告 |
| `product-walker-explorer` | orchestrator 派单（每路径 1 个） | 沿一条路径走产品，记录 session，上报 bug |
| `product-walker-hunter` | orchestrator 派单查漏 | 4 视角找主清单遗漏的路径 |
| `product-walker-verifier` | orchestrator 收到 bug | 7 问验证 bug 真实性/可复现/严重度/ROI |
| `product-walker-fixer` | bug 被 confirmed | 按 TDD 纪律修复并 commit |
| `product-walker-index` | 用户问有哪些 skill | 本 skill，索引/帮助 |

## 调用关系

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
  │    └─ TDD 修复 → git commit → bug 状态 fixed
  │
  └─ 聚合报告 → 写 reports/PW-RPT-YYYY-MM-DD.md
```

## 数据流

```
paths/*.json  ──→ explorer ──→ sessions/*.json
                                  │
                                  └─→ bugs/*.json ──→ verifier ──→ bugs/*.verdict.json
                                                                          │
                                                                    confirmed ↓
                                                                          │
                                                                    fixer ──→ git commit
                                                                          │
                                                                    reports/*.md ← orchestrator 聚合
```

## 典型用法

### 体验一个模块

> 用 product-walker-orchestrator 体验 yonder 的 auth 模块。

### 体验全项目

> 用 product-walker-orchestrator 走遍 yonder 全项目的主流程。

### 只跑一条已知路径

> 用 product-walker-explorer 走 product-walker/paths/PW-AUTH-001.json。

### 查漏

> 用 product-walker-hunter 用 4 视角检查 auth 模块的路径清单有没有遗漏。

### 验证单个 bug

> 用 product-walker-verifier 验证 product-walker/bugs/PW-BUG-001.json。

### 修复 confirmed bug

> 用 product-walker-fixer 修复 product-walker/bugs/PW-BUG-001.json。

## 关键约束

- 本 skill 只读不写，不改任何数据
- 不直接派 sub-agent（派单是 orchestrator 的职责）
