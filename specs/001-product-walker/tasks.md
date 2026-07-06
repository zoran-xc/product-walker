# product-walker 任务拆解

> 编号：001-product-walker
> 状态：draft
> 优先级：P0 > P1 > P2

## P0：最小可用闭环（MVP）

目标：能对一个 web 模块跑通「拆路径 → 走路径 → 上报 bug → 验证 → 出报告」。

### P0-1 skill 文档

- [ ] `skills/product-walker-orchestrator/SKILL.md`：主控编排器，含派发 prompt 模板
- [ ] `skills/product-walker-explorer/SKILL.md`：体验探索员，含 session 维护规则
- [ ] `skills/product-walker-verifier/SKILL.md`：bug 验证员，含 7 问验证清单
- [ ] `skills/product-walker-index/SKILL.md`：索引 skill
- [ ] `skills/README.md`：skill 总索引

### P0-2 JSON schema

- [ ] `schemas/path.ts`：体验路径定义
- [ ] `schemas/session.ts`：体验会话记录
- [ ] `schemas/bug.ts`：bug 记录 + verdict
- [ ] `schemas/report.ts`：聚合报告
- [ ] `schemas/index.ts`：重新导出

### P0-3 Playwright driver

- [ ] `runtime/browser/driver.ts`：BrowserDriver 接口
- [ ] `runtime/browser/playwright-driver.ts`：完整实现（chromium）
- [ ] `runtime/browser/index.ts`：createDriver 工厂

### P0-4 storage + cli

- [ ] `runtime/storage.ts`：read/write/list path/session/bug/report
- [ ] `runtime/cli.ts`：init/run/report 命令

### P0-5 最小闭环验证

- [ ] 用 example-path.json 跑通 explorer → 上报 bug → verifier 验证
- [ ] 写一个 contract 测试：path/session/bug schema 自洽

## P1：扩展能力

### P1-1 CDP driver

- [ ] `runtime/browser/cdp-driver.ts`：连接已开 Chrome（端口 9222）
- [ ] 支持「接管真实浏览器」模式

### P1-2 hunter skill

- [ ] `skills/product-walker-hunter/SKILL.md`：4 视角查漏算法
- [ ] 路径查重算法（相似度 > 80% 不算新）

### P1-3 fixer skill

- [ ] `skills/product-walker-fixer/SKILL.md`：按 TDD 修复 + commit
- [ ] git 操作 helper

### P1-4 bug 闭环

- [ ] bug 状态机实现（reported → reproducing → confirmed/rejected → fixing → fixed → closed）
- [ ] verdict 写入 `bugs/PW-BUG-*.verdict.json`

## P2：高级特性

### P2-1 Tauri driver

- [ ] `runtime/browser/tauri-driver.ts`：完整实现（需 Tauri WebView2 IPC 桥）
- [ ] 适配桌面端测试

### P2-2 4 视角查漏算法

- [ ] hunter 的 4 视角各自实现独立函数
- [ ] 视角间去重

### P2-3 报告聚合

- [ ] `reports/PW-RPT-*.md` 聚合多路径结果
- [ ] 覆盖率统计（pathTotal / pathCompleted）
- [ ] 体验缺陷 top 列表

### P2-4 集成测试

- [ ] 端到端：对一个 demo 项目跑完整闭环
- [ ] 并发测试：多 explorer 同时跑不冲突

## 完成定义（DoD）

- [ ] 所有 P0 任务完成
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过（至少 schema contract 测试）
- [ ] README 的快速开始 3 步能跑通
- [ ] 在一个真实项目（如 yonder）上跑通 auth 模块体验
