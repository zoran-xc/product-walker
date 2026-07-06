---
name: "product-walker-orchestrator"
description: "AI 产品体验师主控编排器 - 拆解模块、派发子 agent 走遍产品路径"
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

## 何时触发

用户说「体验 X 模块」「测一下 X」「走一遍 X 的所有路径」时触发本 skill。
本 skill 不直接操作浏览器，只做编排和路径生成。

## 输入

- 目标模块名（如 `auth`、`chat`、`billing`）或「全项目」
- 可选：driver 类型（默认 playwright）
- 可选：数据目录（默认 `./product-walker/`）

## 执行流程（7 步）

### 第 1 步：枚举模块入口

用 Read / Grep 扫描宿主项目的 spec 和 code，找出该模块的所有：
- 路由入口（页面 URL、API endpoint）
- 用户可见功能点（按钮、表单、菜单项）
- 状态流转（登录态、空态、错误态）

输出一份「功能点清单」（可暂存在内存，不必落盘）。

### 第 2 步：生成候选路径清单（60 分基线）

为每个功能点生成一条 `perspective=happy` 的主流程路径，写成 `paths/PW-<MOD>-NNN.json`：

```json
{
  "id": "PW-AUTH-001",
  "name": "正常登录",
  "module": "auth",
  "goal": "用户用正确账号密码登录成功",
  "perspective": "happy",
  "prerequisites": [{"type": "env", "description": "本地 dev 服务已起"}],
  "steps": [
    {"id": "s1", "action": "打开登录页", "target": "/login", "expected": "看到登录表单"},
    {"id": "s2", "action": "输入账号密码", "target": "input[name=email]", "expected": "输入框有值"},
    {"id": "s3", "action": "点击登录按钮", "target": "button[type=submit]", "expected": "跳转到首页"}
  ],
  "expectedOutcome": "用户登录成功，进入主页",
  "metadata": {"createdAt": "2026-07-06", "createdBy": "orchestrator", "version": "0.1.0"}
}
```

路径 id 单调递增、全局唯一。这只是 60 分基线，hunter 会补齐。

### 第 3 步：派发 explorer sub-agent（并发）

对每条路径，派一个 explorer sub-agent。**派发 prompt 模板**：

```
你是 product-walker-explorer。请体验下面这条路径，并以真人产品体验师的视角观察。

路径定义（path.json）：
<贴入 path.json 内容>

要求：
1. 用 product-walker runtime 的 Playwright driver 走这条路径
2. 维护 sessions/PW-SESS-<pathId>.json，每步记录实际观察 + 截图路径 + DOM 快照
3. 走的过程中允许自主介入（看到可疑 UI 主动点、走不通换条路），但每次介入记到 interventions[]
4. 发现异常就写 bugs/PW-BUG-NNN.json（含复现步骤、截图、DOM、console/network 错误）
5. 走完路径写 reports/PW-RPT-<pathId>.md 单路径小结
6. 不要改宿主项目代码，不要删任何 bug 数据

完成后回报：走了哪些步骤、发现几个 bug、session 文件路径。
```

并发派发，等所有 explorer 回来。

### 第 4 步：派发 hunter sub-agent（查漏，可多轮）

收齐 explorer 汇报后，派 hunter。**派发 prompt 模板**：

```
你是 product-walker-hunter。请从空上下文出发（不要被已有路径框住），
用 4 种视角审视 <模块名> 模块，找出主清单遗漏的体验路径。

已有路径清单（仅供查重，不要照抄）：
<贴入 paths/ 目录列表>

4 种视角：
1. 用户真实场景：多任务切换、刷新窗口、缓存 bug、网络抖动、断电恢复
2. 跨模块跳入：用户是否可能直接跳到流程中间环节（书签、分享链接、URL 参数）
3. 外部环境：服务端变动、系统通知、其他消息打断、主题/时区变化
4. 迭代延伸：从已有路径变体（参数变、顺序变、组合变、重复变）

要求：
1. 每个视角至少产出 1 条候选路径，或显式声明「该视角无遗漏」并说明理由
2. 新路径与已有路径查重，相似度 > 80% 不算新（按 goal + steps 关键词比对）
3. 新路径 perspective 设为对应视角（real-user/cross-module/external-env/variant）
4. 写成 paths/PW-<MOD>-NNN.json

完成后回报：新增几条路径、分别属于哪个视角。
```

可多轮查漏（每轮把上轮新路径并入清单再查）。

### 第 5 步：对新路径再派 explorer

hunter 产出的新路径，按第 3 步流程再派 explorer 走一遍。

### 第 6 步：派 verifier 验证每个 bug

收齐所有 bug 后，对每个 bug派一个 verifier。**派发 prompt 模板**：

```
你是 product-walker-verifier。请验证下面这个 bug。

bug 文件：<bugs/PW-BUG-NNN.json 路径>

按 7 问验证清单逐条判断：
1. 是否真实存在（不是猜测/推断）
2. 是否可复现（按步骤能稳定重现）
3. 是否是误报（agent 看错了，实际正常）
4. 是否是过度设计（agent 要求过严，非 bug）
5. 是否影响用户体验（用户会困扰吗）
6. 严重度（P0 阻断 / P1 影响 / P2 体验 / P3 美观）
7. 是否值得修（ROI）

写结论到 bugs/PW-BUG-NNN.verdict.json：
{ "decision": "confirmed" | "rejected" | "needs-info", "reason": "...", "reproducedBy": "...", "reproducedAt": "..." }

confirmed 才进修复流程；rejected/rejected 留档不修。
```

### 第 7 步：confirmed bug 派 fixer

对每个 confirmed bug 派 fixer。**派发 prompt 模板**：

```
你是 product-walker-fixer。请修复下面这个 confirmed bug。

bug 文件：<bugs/PW-BUG-NNN.json 路径>

要求：
1. 读 bug 的复现步骤 + 截图 + DOM 快照，理解问题
2. 用 Grep/Read 定位宿主项目源码
3. 严格按宿主项目的 TDD 纪律：先写失败测试 → 改实现 → 跑绿
4. 跑测试确认通过
5. git add <只改的文件> + commit（遵循宿主 commit 规约，中文 message）
6. 不能改测试断言让实现过、不能跳过 TDD、不能捎带其他改动

完成后回报：改了哪些文件、commit hash、测试结果。
```

fixer 建议串行（避免 git 冲突），除非 bug 互不相干。

### 第 8 步：聚合报告

把所有路径、bug、修复结果聚合成 `reports/PW-RPT-YYYY-MM-DD.md`：

- 路径总数 / 完成数
- bug 总数 / confirmed / rejected / fixed
- top bug 列表
- 覆盖率缺口（哪些视角还没覆盖）
- 改进建议

## 关键约束

- 本 skill 不直接操作浏览器，只编排
- 路径 id 全局唯一、单调递增
- 每个 bug 必须经 verifier 确认才进修复
- fixer 必须遵守宿主 TDD 纪律
- 并发写文件时用文件锁防冲突

## 与其他 skill 的关系

- 派发 `product-walker-explorer` 走路径
- 派发 `product-walker-hunter` 查漏
- 派发 `product-walker-verifier` 验证 bug
- 派发 `product-walker-fixer` 修复 confirmed bug
