# templates 目录说明

本目录提供用户模板，帮助你在自己的项目里快速接入 product-walker。

## paths/example-path.json

一个完整的体验路径示例：登录 → 查看会话 → 发送消息 → 退出。

字段含义详见 [`../schemas/path.ts`](../schemas/path.ts) 或仓库根 [README.md](../README.md) 的 JSON Schema 列表。

## 如何在你的项目里创建 paths/

1. 在你的项目根目录创建数据目录（默认 `product-walker/`）：

```
your-project/
└── product-walker/
    ├── paths/        # 把体验路径写在这里
    ├── sessions/     # agent 跑出来的会话（自动生成）
    ├── bugs/         # bug 记录（自动生成）
    └── reports/      # 聚合报告（自动生成）
```

2. 复制 `example-path.json` 到 `your-project/product-walker/paths/`，按你的产品改写：
   - `id`：全局唯一，形如 `PW-<MOD>-001`（MOD 是模块缩写大写）
   - `module`：你的模块名
   - `steps[].target`：用稳定的选择器（推荐 `data-testid`）或 URL
   - `steps[].expected`：写清楚每一步期望看到什么

3. 把 `product-walker/` 加入 `.gitignore`（除非你想把测试记录入库）：

```
# .gitignore
product-walker/
```

4. 也可以直接让 orchestrator 自动生成路径——不用手写。在 agent 会话里说：
   > 用 product-walker-orchestrator 体验 my-app 的 auth 模块。

orchestrator 会扫描你的项目并生成 `paths/PW-*.json`。
