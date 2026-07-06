---
name: "product-walker-hunter"
description: "场景猎人 - 从空上下文出发，用 4 视角找出主清单遗漏的体验路径"
argument-hint: "<模块名> + 已有路径清单目录（如 product-walker/paths/）"
compatibility: "无浏览器依赖，纯路径生成（可后续派 explorer 走）"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-hunter

> 场景猎人。从空上下文出发，用 4 种视角找出 orchestrator 主清单遗漏的体验路径。

## 何时触发

由 orchestrator 派单查漏时触发。也可多轮调用（每轮把上轮新路径并入清单再查）。

## 输入

- 目标模块名（如 `auth`）
- 已有路径清单（`product-walker/paths/` 目录，仅供查重，**不要照抄**）

## 核心原则

**从空上下文出发**。不要被已有路径框住思维。已有清单只用来查重，不用来启发。

## 4 视角查漏算法

### 视角 1：用户真实场景（perspective: real-user）

模拟真人在使用产品时的真实场景，而非理想 happy path。考虑：

- **多任务切换**：用户开了几个 tab，在 tab 间切换，状态是否一致
- **刷新窗口**：用户在某个流程中间刷新页面，表单数据丢失吗、登录态保留吗
- **缓存 bug**：登录态过期、缓存数据与服务端不一致、localStorage 撑爆
- **网络抖动**：请求超时、断网恢复、弱网下重复提交
- **断电恢复**：浏览器崩溃后重开，是否有恢复机制
- **慢操作**：用户在请求返回前反复点击、连续提交

输出：每个场景写一条 `paths/PW-<MOD>-NNN.json`，`perspective=real-user`。

### 视角 2：跨模块跳入（perspective: cross-module）

用户不一定从模块入口进入，可能直接跳到流程中间：

- 通过书签直接打开某个深层页面（如 `/settings/billing`）
- 通过分享链接跳到某个会话/文档（带 token 或 invite 参数）
- 通过 URL 参数进入某状态（如 `?ref=email`）
- 检查这种跳入是否需要前置数据，**缺失时有没有兜底**（引导登录、空态提示）
- 从其他模块跳转过来（如从「订单」跳到「支付」，中间状态是否衔接）

输出：每条 `perspective=cross-module`。

### 视角 3：外部环境（perspective: external-env）

外部环境变化对产品的影响：

- **服务端数据变动**：其他人改了数据，本端没刷新（并发修改、数据被删）
- **系统通知**：推送、邮件链接回跳（深度链接是否正确）
- **其他 IM 消息进入**：打断当前流程（如正在编辑时收到消息切换）
- **系统主题切换**：暗色/亮色模式切换、时区变化、语言切换
- **权限变动**：会话进行中权限被收回（token 失效、被踢下线）

输出：每条 `perspective=external-env`。

### 视角 4：迭代延伸（perspective: variant）

从已有路径衍生变体（这一步可以参考已有清单）：

- **参数变**：不同输入值、边界值、空值、超长值、特殊字符
- **顺序变**：步骤调换、跳过某步、重复某步
- **组合变**：多条路径串联（登录 → 下单 → 支付 → 退款）
- **重复变**：连续触发同一操作（连点、并发提交）

输出：每条 `perspective=variant`。

## 查重算法

新路径与已有路径（含本轮已生成的）对比，**相似度 > 80% 不算新**：

- 比对 `goal` 的关键词重合度
- 比对 `steps[].action` 的关键词重合度
- 若两条路径只是参数不同（goal 相同、步骤相同），算 variant 而非新路径，合并

每个视角至少产出 1 条候选路径，或**显式声明**「该视角无遗漏」并说明理由（不能默认跳过）。

## 输出

新路径写成 `paths/PW-<MOD>-NNN.json`，`perspective` 设为对应视角。id 用 `nextId('PW-<MOD>', 'paths')` 保证递增。

完成后回报：
- 新增几条路径
- 分别属于哪个视角
- 哪个视角判定「无遗漏」及理由

## 关键约束

- **从空上下文出发**：不要被已有路径框住，前 3 个视角尤其要独立思考
- **每条新路径要可执行**：步骤要具体到能派 explorer 走
- **查重要严**：避免产出大量重复变体冲数
- **不直接走路径**：本 skill 只生成路径，走路径交给 explorer

## 与其他 skill 的关系

- 上游：`product-walker-orchestrator` 派单
- 下游：新路径由 orchestrator 再派 `product-walker-explorer` 走一遍
