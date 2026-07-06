---
name: "product-walker-hunter"
description: "场景猎人 - 从空上下文出发，用 4 视角 + L1-L4 粒度分层找出主清单遗漏的体验路径，支持多轮迭代延伸"
argument-hint: "<模块名> + 已有路径清单目录 + 轮次（如 round=2 从一级延伸二级）"
compatibility: "无浏览器依赖，纯路径生成"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-hunter

> 场景猎人。从空上下文出发，用 4 种视角 + L1-L4 粒度分层找出 orchestrator 主清单遗漏的体验路径。
> 支持多轮迭代：第 N 轮从第 N-1 轮的叶子路径延伸更细粒度的子路径。

## 何时触发

- 由 orchestrator 派单查漏时触发（round=1，一级路径查漏）
- 多轮迭代时，orchestrator 派 round=2/3/4 hunter，从已有叶子延伸细粒度子路径
- 也可用户直接调用：「从 PW-AUTH-001 延伸细粒度用例」

## 输入

- 目标模块名（如 `auth`）
- 已有路径清单（`product-walker/paths/` 目录，仅供查重 + 作为延伸基础）
- 轮次 round（1=一级查漏, 2=从一级延伸二级, 3=从二级延伸三级, 4=从三级延伸四级）
- 可选：指定父路径 id（如只从 PW-AUTH-001 延伸）

## 粒度分层（L1-L4）

### L1 模块级（粗粒度，round=1）

走通整个模块的主流程。
- 例：PW-AUTH-001 正常登录
- 例：PW-MSG-001 发送一条文本消息
- 关注：流程是否能走通、主路径是否可用
- assertions：可为空（只看自然语言 expected）

### L2 流程级（中粒度，round=2）

某功能流程的所有变体。
- 例：PW-AUTH-001.001 登录表单各种输入组合（空邮箱/空密码/超长/特殊字符）
- 例：PW-AUTH-001.002 登录失败的各种错误码（401/429/500）
- 关注：流程的不同输入/状态变体
- assertions：可选（关键变体加 1-2 条）

### L3 交互级（细粒度，round=3）

单个交互元素的行为。
- 例：PW-AUTH-001.001.001 密码框失焦校验（空值时错误提示 visible + text）
- 例：PW-AUTH-001.001.002 登录按钮 disabled 状态（表单无效时 class 包含 disabled）
- 例：PW-MSG-001.001.001 发送按钮在空输入框时 disabled + tooltip 文案
- 关注：按钮/输入框/提示/校验等单元素行为
- assertions：必填至少 1 条（精确到 visible/hidden/text/attribute/class/state）

### L4 视觉级（微粒度，round=4）

视觉表现细节。
- 例：PW-AUTH-001.001.001.001 密码框 focus 时边框颜色（style border-color）
- 例：PW-MSG-001.001.001.001 未读消息红点 visible + class 包含 badge-danger + count === 1
- 例：PW-MSG-001.001.001.002 loading spinner 旋转动画存在（class 包含 animate-spin）
- 例：PW-MSG-001.001.001.003 hover 时按钮背景色变化（style background-color）
- 关注：颜色/动画/边距/图标/红点等视觉细节
- assertions：必填至少 2 条（精确到 style/class/count）

## 多轮迭代算法

### 第 1 轮（round=1，一级查漏）

从空上下文出发，用 4 视角找一级路径（L1）遗漏：
1. 用户真实场景（perspective: real-user）
2. 跨模块跳入（perspective: cross-module）
3. 外部环境（perspective: external-env）
4. 迭代延伸（perspective: variant）

输出：paths/PW-<MOD>-NNN.json，depth=1, granularity=L1, round=1, parentId=null

### 第 2 轮（round=2，二级延伸）

从每个一级路径延伸二级子路径（L2），关注流程变体：
- 遍历 round=1 的一级路径
- 对每条一级路径，思考"这个流程有哪些输入/状态变体"
- 产出二级路径：id = <parentId>.NNN, depth=2, granularity=L2, round=2, parentId=<一级id>

例：从 PW-AUTH-001（正常登录）延伸：
- PW-AUTH-001.001 空邮箱登录
- PW-AUTH-001.002 空密码登录
- PW-AUTH-001.003 错误密码登录
- PW-AUTH-001.004 超长密码登录
- PW-AUTH-001.005 特殊字符邮箱登录

### 第 3 轮（round=3，三级延伸）

从二级路径延伸三级子路径（L3），关注交互细节：
- 遍历 round=2 的二级路径
- 对每条二级路径，思考"这个流程里每个交互元素的行为细节"
- 产出三级路径：id = <parentId>.NNN, depth=3, granularity=L3, round=3, parentId=<二级id>

例：从 PW-AUTH-001.001（空邮箱登录）延伸：
- PW-AUTH-001.001.001 邮箱框失焦时错误提示出现
- PW-AUTH-001.001.002 登录按钮在邮箱为空时 disabled
- PW-AUTH-001.001.003 错误提示文案为"请输入邮箱"

### 第 4 轮（round=4，四级延伸）

从三级路径延伸四级子路径（L4），关注视觉细节：
- 遍历 round=3 的三级路径
- 对每条三级路径，思考"这个交互的视觉表现细节"
- 产出四级路径：id = <parentId>.NNN, depth=4, granularity=L4, round=4, parentId=<三级id>

例：从 PW-AUTH-001.001.001（邮箱框失焦错误提示）延伸：
- PW-AUTH-001.001.001.001 错误提示文字颜色为红色
- PW-AUTH-001.001.001.002 错误图标 visible 且 class 包含 text-red-500
- PW-AUTH-001.001.001.003 错误提示出现时有淡入动画

## 4 视角查漏（适用于每一轮）

每一轮查漏都从 4 视角出发，但关注点随粒度变化：

### 视角 1：用户真实场景（perspective: real-user）

- L1：多任务切换、刷新窗口、断电恢复
- L2：不同输入值、边界值、空值
- L3：用户在请求返回前反复点击、连续提交
- L4：弱网下 loading 状态是否正确

### 视角 2：跨模块跳入（perspective: cross-module）

- L1：从其他模块跳转过来
- L2：带不同 URL 参数进入
- L3：跳入后某按钮的初始状态
- L4：跳入后页面元素的视觉初始化

### 视角 3：外部环境（perspective: external-env）

- L1：服务端数据变动、系统通知
- L2：token 失效时的不同错误码
- L3：被踢下线时按钮状态变化
- L4：暗色模式下视觉元素是否正确

### 视角 4：迭代延伸（perspective: variant）

- L1：多条路径串联
- L2：参数变、顺序变、组合变
- L3：重复触发同一交互
- L4：连续操作时的视觉反馈

## 查重算法

新路径与已有路径（含本轮已生成的）对比，**相似度 > 80% 不算新**：

- 比对 `goal` 的关键词重合度
- 比对 `steps[].action` 的关键词重合度
- 比对 `steps[].assertions[].expected` 的重合度（L3/L4）
- 若两条路径只是参数不同，算 variant 而非新路径，合并

每个视角至少产出 1 条候选路径，或**显式声明**「该视角无遗漏」并说明理由。

## 输出

新路径写成 `paths/PW-<MOD>-NNN[.NNN]*.json`：
- 一级：`PW-AUTH-001`（round=1, depth=1, L1）
- 二级：`PW-AUTH-001.002`（round=2, depth=2, parentId=PW-AUTH-001, L2）
- 三级：`PW-AUTH-001.002.003`（round=3, depth=3, parentId=PW-AUTH-001.002, L3）

id 用 `nextId('PW-<MOD>', 'paths', depth)` 保证同层级递增。

完成后回报：
- 新增几条路径
- 分别属于哪个视角、哪个粒度、第几轮
- 哪个视角判定「无遗漏」及理由

## 关键约束

- **从空上下文出发**：前 3 个视角尤其要独立思考
- **粒度逐层细分**：第 N 轮只从第 N-1 轮的叶子延伸，不跨层
- **每条新路径要可执行**：步骤要具体到能派 explorer 走
- **L3/L4 必填 assertions**：细粒度路径必须带可验证断言
- **查重要严**：避免产出大量重复变体冲数
- **不直接走路径**：本 skill 只生成路径，走路径交给 explorer

## 与其他 skill 的关系

- 上游：`product-walker-orchestrator` 派单
- 下游：新路径由 orchestrator 再派 `product-walker-explorer` 走一遍
