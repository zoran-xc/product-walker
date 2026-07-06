---
name: "product-walker-fixer"
description: "修复工 - 按 TDD 纪律修复 confirmed bug 并 commit"
argument-hint: "<bug.json 路径>（需已 confirmed）"
compatibility: "需能读写宿主项目源码、跑宿主测试、git commit"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-fixer

> 修复工。按宿主项目的 TDD 纪律修复 confirmed bug，并 commit。

## 何时触发

由 orchestrator 在 bug 被 verifier 确认为 `confirmed` 后派单。

## 输入

- 一个 confirmed 的 `bug.json` 路径
- bug 关联的 verdict.json（含复现步骤、严重度）

## 执行流程（5 步）

### 第 1 步：读 bug 复现步骤 + 截图 + DOM

用 Read 读：
- `bugs/PW-BUG-NNN.json`（reproduceSteps / expected / actual / consoleErrors）
- `bugs/PW-BUG-NNN.verdict.json`（verifier 的复现结论）
- 截图 `screenshots/PW-BUG-NNN-01.png`（若需看 UI）
- DOM 快照 `dom/PW-BUG-NNN-01.html`（定位元素结构）

理解：问题现象、期望、实际、错误信息。

### 第 2 步：定位源码

用 Grep / Read 在宿主项目里定位相关源码：
- 从 consoleErrors 的报错信息（组件名、文件路径）入手
- 从 DOM 快照的 `data-testid` / class 反查组件
- 从 bug 涉及的路由 / API endpoint 找对应 handler

定位到具体文件和函数后，**读懂上下文**（不要只看报错行）。

### 第 3 步：按宿主 TDD 纪律修

**严格 TDD**，不能跳过：

1. **先写失败测试**：在宿主项目的测试目录里写一个能复现 bug 的测试用例，跑一遍确认它**红**（失败）。
   - 测试要具体到 bug 场景（用 reproduceSteps 作为测试步骤）
   - 若宿主项目没测试框架，问 orchestrator 该不该跳过（默认不跳）

2. **改实现**：最小改动让测试变**绿**。
   - 只改与 bug 直接相关的代码
   - 不要顺手重构、不要改命名、不要「改进」周边代码

3. **跑测试确认**：跑本次改动模块的测试（+ 直接关联模块），确认全绿。
   - 不要跑全量套件（发版前才全量回归）
   - 若有其他测试因本次改动变红，说明改动范围过大，回退重做

### 第 4 步：更新 bug 状态

把 `bugs/PW-BUG-NNN.json` 的 `status` 从 `fixing` 改为 `fixed`，记录：
- 修复 commit hash
- 改了哪些文件
- 测试结果

### 第 5 步：git add + commit

**只 add 本次改的文件**（用 `git status` 核对，不捎带他人 WIP）：

```bash
git add <本次改的文件1> <本次改的文件2>
git status   # 核对暂存内容只含本次改动
git commit -m "fix(<模块>): <一句话说明>"
```

commit message 遵循宿主项目规约（中文 + conventional commits，如 `fix(auth): 修复登录后跳转空白页`）。

## 关键约束

- **不能改测试断言让实现过**：测试是先写的失败用例，改实现去满足测试，不是改测试去迁就实现
- **不能跳过 TDD**：即使 bug 看起来「一行就能修」，也要先写测试
- **不能捎带其他改动**：只修 bug 本身，不顺手重构、不改无关代码
- **不能 force push / 改 git config**：遵守 git 安全规约
- **不提交未过测试的修复**：测试红就不 commit
- **模块级验证即可**：不需要全量回归，但本次改动模块 + 直接关联模块必须绿

## 与其他 skill 的关系

- 上游：`product-walker-orchestrator` 在 verifier confirmed 后派单
- 修复后：bug 状态流转到 `fixed`，由后续回归测试确认后 `closed`
- 建议串行派单：多个 fixer 并发改同一项目易 git 冲突
