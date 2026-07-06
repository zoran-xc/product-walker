---
name: "product-walker-orchestrator"
description: "AI 产品体验师主控编排器 - 拆解模块、派发子 agent 走遍产品路径，支持 L1-L4 粒度分层 + 多轮迭代"
argument-hint: "<目标模块或全项目>，例如：yonder 的 auth 模块"
compatibility: "需要可派发 sub-agent 的 agent 运行时（Claude Code / Cursor / Codex）"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-orchestrator

> 主控编排器。把「体验某模块」拆成可并发的子任务，派给 explorer / hunter / verifier / fixer。
> 支持 L1-L4 粒度分层 + 多轮迭代：第 1 轮走主流程，第 2-N 轮从上轮叶子延伸更细粒度子路径。

## 何时触发

用户说「体验 X 模块」「测一下 X」「走一遍 X 的所有路径」时触发本 skill。
本 skill 不直接操作浏览器，只做编排和路径生成。

## 输入

- 目标模块名（如 `auth`、`chat`、`billing`）或「全项目」
- 可选：driver 类型（默认 playwright）
- 可选：数据目录（默认 `./product-walker/`）
- 可选：轮次 round（默认 1；用户说「细粒度」「第二轮」时 round=2/3/4）

## 分层编号规则

路径 id 用 dot 分隔表示树状延伸：

| 层级 | 格式 | 示例 | 粒度 | round |
|------|------|------|------|-------|
| 一级 | `PW-<MOD>-NNN` | PW-AUTH-001 | L1 模块级 | 1 |
| 二级 | `PW-<MOD>-NNN.NNN` | PW-AUTH-001.002 | L2 流程级 | 2 |
| 三级 | `PW-<MOD>-NNN.NNN.NNN` | PW-AUTH-001.002.003 | L3 交互级 | 3 |
| 四级 | `PW-<MOD>-NNN.NNN.NNN.NNN` | PW-AUTH-001.002.003.004 | L4 视觉级 | 4 |

- dot 分隔保证字典序排列时父路径在子路径前（PW-AUTH-001 < PW-AUTH-001.002）
- 二级路径的 `parentId` = 其一级路径 id，`rootId` = 一级路径 id
- 同层级 NNN 单调递增、全局唯一
- L3/L4 路径的 steps 必填 `assertions[]`（可验证断言）

## 执行流程（8 步 + 可选多轮迭代）

### 第 1 步：枚举模块入口

用 Read / Grep 扫描宿主项目的 spec 和 code，找出该模块的所有：
- 路由入口（页面 URL、API endpoint）
- 用户可见功能点（按钮、表单、菜单项）
- 状态流转（登录态、空态、错误态）

输出一份「功能点清单」（可暂存在内存，不必落盘）。

### 第 2 步：生成候选路径清单（60 分基线，round=1, L1）

为每个功能点生成一条 `perspective=happy` 的主流程路径，写成 `paths/PW-<MOD>-NNN.json`：

```json
{
  "id": "PW-AUTH-001",
  "name": "正常登录",
  "module": "auth",
  "goal": "用户用正确账号密码登录成功",
  "perspective": "happy",
  "depth": 1,
  "parentId": null,
  "rootId": "PW-AUTH-001",
  "granularity": "L1",
  "round": 1,
  "prerequisites": [{"type": "env", "description": "本地 dev 服务已起"}],
  "steps": [
    {"id": "s1", "action": "打开登录页", "target": "/login", "expected": "看到登录表单", "assertions": []},
    {"id": "s2", "action": "输入账号密码", "target": "input[name=email]", "expected": "输入框有值", "assertions": []},
    {"id": "s3", "action": "点击登录按钮", "target": "button[type=submit]", "expected": "跳转到首页", "assertions": []}
  ],
  "expectedOutcome": "用户登录成功，进入主页",
  "metadata": {"createdAt": "2026-07-06", "createdBy": "orchestrator", "version": "0.1.0"}
}
```

路径 id 单调递增、全局唯一。这只是 60 分基线，hunter 会补齐。

### 第 3 步：派发 explorer sub-agent（并发）

对每条路径，派一个 explorer sub-agent（派发 prompt 模板见 hunter skill）。
并发派发，等所有 explorer 回来。

### 第 4 步：派发 hunter sub-agent（查漏 round=1）

收齐 explorer 汇报后，派 hunter 做一级查漏（4 视角，L1 粒度）。

### 第 5 步：对新路径再派 explorer

hunter 产出的新路径，按第 3 步流程再派 explorer 走一遍。

### 第 6 步：派 verifier 验证每个 bug

收齐所有 bug 后，对每个 bug 派一个 verifier（7 问验证清单）。
confirmed 才进修复流程；rejected 留档不修。

### 第 7 步：confirmed bug 派 fixer

对每个 confirmed bug 派 fixer。fixer 建议串行（避免 git 冲突），除非 bug 互不相干。

### 第 8 步：聚合报告

把所有路径、bug、修复结果聚合成 `reports/PW-RPT-YYYY-MM-DD.md`。

### 可选：多轮迭代（round=2/3/4，细粒度延伸）

第 8 步后，用户可选择继续跑更细粒度的轮次：

**round=2（L2 流程级）**：派 hunter 从每个一级路径延伸二级子路径，关注输入/状态变体。
- hunter 遍历 round=1 的叶子，产出 `PW-<MOD>-NNN.NNN.json`（depth=2, granularity=L2, round=2）
- 对新二级路径派 explorer 走一遍
- 新发现的 bug 派 verifier + fixer

**round=3（L3 交互级）**：派 hunter 从二级路径延伸三级，关注单交互元素行为。
- 产出 `PW-<MOD>-NNN.NNN.NNN.json`（depth=3, granularity=L3, round=3）
- L3 路径 steps 必填 assertions[]

**round=4（L4 视觉级）**：派 hunter 从三级延伸四级，关注视觉细节。
- 产出 `PW-<MOD>-NNN.NNN.NNN.NNN.json`（depth=4, granularity=L4, round=4）
- L4 路径 steps 必填至少 2 条 assertions[]

每轮结束更新聚合报告。迭代直到 4 视角均无新路径产出，或用户喊停。

## 关键约束

### runtime 与宿主测试的边界（重要）

product-walker 的产出与宿主项目的测试完全隔离，不重合：

- **product-walker 数据目录**：`<宿主>/product-walker/`（paths/sessions/bugs/reports）
  - 这是「体验记录」，不是「测试代码」
  - 只在 product-walker/ 目录下，不污染宿主 e2e 或 __tests__
- **宿主 e2e 测试**：`<宿主>/e2e/`（契约验证，保证 spec 实现）
- **宿主单元测试**：`<宿主>/server/src/__tests__/` 等
- **fixer 写回归测试**：放宿主 `__tests__/pw-bug-NNN.test.ts`，带 `pw-bug-` 前缀与宿主原有测试区分
  - 这是 fixer 的产物，不是 product-walker 的数据
- **职责划分**：
  - 宿主 e2e = 契约验证（实现是否符合 spec）
  - product-walker = 体验发现（spec 没覆盖的体验缺陷）
  - 两者互补不重叠：e2e 验证「做对了」，product-walker 发现「漏了什么」

### 其他约束

- 本 skill 不直接操作浏览器，只编排
- 路径 id 全局唯一、单调递增；分层用 dot 分隔
- 每个 bug 必须经 verifier 确认才进修复
- fixer 必须遵守宿主 TDD 纪律
- 并发写文件时用文件锁防冲突
- L3/L4 路径必填 assertions（可验证断言）

## 与其他 skill 的关系

- 派发 `product-walker-explorer` 走路径
- 派发 `product-walker-hunter` 查漏（支持 round=1/2/3/4 多轮）
- 派发 `product-walker-verifier` 验证 bug
- 派发 `product-walker-fixer` 修复 confirmed bug
