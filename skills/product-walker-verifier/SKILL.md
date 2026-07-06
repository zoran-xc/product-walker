---
name: "product-walker-verifier"
description: "bug 验证员 - 用 7 问清单验证 bug 真实性、可复现性、严重度、ROI"
argument-hint: "<bug.json 路径>，例如：product-walker/bugs/PW-BUG-001.json"
compatibility: "需要 driver 复现 bug（默认 playwright）"
metadata:
  author: "zoran-xc"
  source: "product-walker"
  user-invocable: true
  disable-model-invocation: false
---

# product-walker-verifier

> bug 验证员。验证 explorer 上报的 bug：是否真实、可复现、严重度、值不值得修。

## 何时触发

由 orchestrator 收到 bug 后派单。每个 bug 派一个 verifier。

## 输入

- 一个 `bug.json` 的路径
- 可选：driver 类型（复现时用）

## 7 问验证清单

逐条判断，每条都要给出明确结论（不能含糊）：

### 问 1：是否真实存在？

bug 描述的现象是不是真的发生了？还是 agent 的**猜测/推断**？
- 看 reproduceSteps 是否具体到可执行
- 看 screenshots / domSnapshot 是否能对应描述
- 若只有文字描述无证据 → 标记 `needs-info`，退回 explorer 补证据

### 问 2：是否可复现？

按 reproduceSteps 重新走一遍，能不能**稳定重现**？
- 用 driver 实际操作一遍（不要只看截图推断）
- 跑 2-3 次确认稳定性（偶发 bug 标注「偶发」+ 复现概率）
- 若无法复现 → 标注「未能复现」，但不能直接判 rejected（可能是环境差异）

### 问 3：是否是误报？

agent 是不是看错了，实际一切正常？
- 常见误报：把 loading 态当成 bug、把预期的空态当成数据缺失、把测试账号问题当成产品 bug
- 若判定误报 → `rejected`，verdict.reason 写清楚「实际是 X，非 bug」

### 问 4：是否是过度设计？

agent 是不是要求过严，把**非 bug 的设计选择**当成缺陷？
- 常见过度设计：要求必须有 loading 动画、要求必须有空态插画、要求必须有确认弹窗（但产品有意不做）
- 这类不算 bug → `rejected`，reason 注明「属设计取舍，非缺陷」

### 问 5：是否影响用户体验？

真用户会困扰吗？还是只有自动化/agent 才会触发？
- 影响大：阻断流程、数据丢失、错误信息误导
- 影响小：边缘 case、需特殊操作才触发
- 不影响：纯视觉、agent 自造场景

### 问 6：严重度？

- **P0 阻断**：核心流程完全走不通（登录失败、崩溃、数据丢失）
- **P1 影响**：主要功能受损但有 workaround（某按钮失效、某流程报错但能绕过）
- **P2 体验**：不影响功能但体验差（loading 卡顿、错误提示不友好、布局错位）
- **P3 美观**：纯视觉/文案问题（错别字、对齐、颜色）

更新 bug.json 的 `severity` 字段。

### 问 7：是否值得修？（ROI）

- 修复成本（改几行 vs 重构）vs 收益（影响多少用户）
- P0/P1 几乎都值得修
- P2/P3 看频次和影响面：高频小问题也值得修
- 极低频 + 极小影响 → 可标 `rejected`（reason: ROI 过低，建议 backlog）

## 输出

写 `product-walker/bugs/PW-BUG-NNN.verdict.json`：

```json
{
  "decision": "confirmed",
  "reason": "按复现步骤稳定重现：登录后跳转 /dashboard 空白，console 报 React 渲染错误。属 P1，影响所有登录用户，值得修。",
  "reproducedBy": "verifier-1",
  "reproducedAt": "2026-07-06T10:05:00Z"
}
```

- `decision`: `confirmed`（进修复）/ `rejected`（误报/过度设计/ROI 低）/ `needs-info`（证据不足，退回 explorer）
- 同时更新 bug.json 的 `status`：`reported` → `reproducing` → `confirmed` 或 `rejected`

## 关键约束

- **必须实际复现**：不能只看截图和描述就下结论，要用 driver 走一遍
- **每问必答**：7 问逐条给结论，不能跳过
- **rejected 要留档**：写清理由，便于事后审计和改进 explorer 的判断
- **不修复**：本 skill 只验证，修复交给 fixer
- **不臆断严重度**：P0/P1 要有依据（影响面、是否阻断）

## 与其他 skill 的关系

- 上游：`product-walker-orchestrator` 收到 explorer 的 bug 后派单
- 下游：`confirmed` 的 bug 由 orchestrator 派 `product-walker-fixer` 修复
