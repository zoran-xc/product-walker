# 国际化 i18n 对齐扫描清单

> 横向扫描所有前端组件 + 后端响应,找出硬编码中文文案 vs 已有 i18n 调用（t() 函数）的不一致违规。
>
> **触发信号**：发现 1 个组件含硬编码中文且未走 t() → 全代码库扫描同类模式。

## 何时触发

- 发现某前端组件含中文文案字面量且未在 `t()` 调用内 → 触发硬编码扫描
- 发现某后端 Errors.* 工厂调用 message 字段含中文 → 触发后端 i18n 扫描
- 发现某项目已有 i18n 基础设施（react-i18next / vue-i18next）但覆盖率不全 → 触发覆盖率审计
- 发现某响应错误码（如 RATE_LIMIT_EXCEEDED）在 errors.json 缺翻译 → 触发 key 覆盖审计

## 检查项

### 1. 前端硬编码中文文案

- [ ] 所有 JSX 文本节点（`<div>中文</div>`）走 t() 调用
- [ ] 所有 JSX 属性（title / placeholder / aria-label / label）走 t()
- [ ] 所有 toast / notification 消息走 t()
- [ ] 所有对象字面量 label 字段（状态枚举 / tab 选项）走 t()
- [ ] 高频文案（确定 / 取消 / 保存 / 删除 / 加载中）建立 common namespace 复用

**案例**：yonder PW-SCAN-i18n 发现 84 tsx 含中文,27 已 t() 化,余 57 文件 151 处 JSX 文本 + 109 处 JSX 属性 + 68 处 toast + 95 处对象字面量硬编码

### 2. 后端 Errors.* 中文 message

- [ ] 所有 Errors.* 工厂调用 message 字段不直接含中文,改用 i18n key
- [ ] Errors 工厂应支持「key + 动态参数」模式,客户端按 key 翻译
- [ ] 后端响应错误独立 code 字段（如 RATE_LIMIT_EXCEEDED）,client 程序化处理
- [ ] errors.json 覆盖所有后端 code（含细化 code,不只是 HTTP 通用 code）

**案例**：yonder PW-BUG-035 后端 22 文件 156 处 Errors.* 中文 + 3 处 routes 直接中文 + 11 处工厂默认值 + wechatCallbackHtml 中文,共 159 处

### 3. i18n 基础设施评估

- [ ] 项目是否已引入 i18n 库（react-i18next / vue-i18next / 简单 t() 函数）
- [ ] 是否有 namespaces 划分（common / messages / errors / landing 等）
- [ ] 是否提供多语言（zh + en 至少）
- [ ] lib/i18n.ts 是否封装统一入口（避免散落 t() 调用）
- [ ] format-error.ts 是否处理 code → message 的客户端翻译

### 4. 高频文案复用审计

- [ ] 统计 top 10 高频文案（如「确定」N 次 / 「取消」M 次）建立复用清单
- [ ] 检查是否有重复定义（同一文案在不同 namespace 多次定义）
- [ ] 检查是否有缺失翻译（zh 有 / en 缺）的 key

**案例**：yonder 后端「不存在」101 次（30 文件,含 ~20 测试）/「无权」15 次;前端「绑定/换绑」34 次 /「验证码」27 次 /「删除」24 次 /「取消」21 次 /「保存」20 次

### 5. errors.json key 覆盖审计

- [ ] errors.json 覆盖所有 HTTP 通用 code（400/401/403/404/409/429/500）
- [ ] 覆盖所有业务细化 code（如 RATE_LIMIT_EXCEEDED / VALIDATION_ERROR / UNAUTHORIZED）
- [ ] 缺失的 code 列表显式声明（标 TODO）
- [ ] 客户端 err.code 未命中 errors.json 时的 fallback 策略（显示通用错误 vs 显示 raw message）

## 扫描方法

1. **Grep `[\u4e00-\u9fa5]`**：找所有中文字符串字面量
2. **区分**：注释里的中文（不算违规）vs 字符串字面量里的中文（违规）
3. **区分类型**：UI 文案（应 i18n）vs 错误 message（应 i18n）vs 日志（可选 i18n）
4. **Grep `useTranslation`**：找已 i18n 化的组件,统计覆盖率
5. **Grep `t\(['\"]`**：找 t() 调用,提取 key 列表
6. **Read errors.json**：找已定义的 key,求差集找缺失
7. **统计高频文案**：用 regex 找重复出现的中文短语

## 产出格式

扫描报告含：

1. **扫描摘要**：文件数 / 硬编码中文文案数 / i18n 基础设施状态 / 覆盖率
2. **违规清单**：表格（文件:行 / 文案 / 类型 UI/错误/日志 / 是否高频复用）
3. **高频文案分布**：top 10 文案 + 出现次数 + 文件分布
4. **i18n 基础设施评估**：项目是否已引入、引入推荐方案
5. **errors.json key 覆盖审计**：缺失 key 清单
6. **新 bug 上报**：仅上报高风险（如后端 159 处全硬编码 + errors.json 缺关键 key）

## yonder 案例参考

- 报告：`PW-SCAN-i18n-alignment.md`
- 触发 bug：无（横向扫描自主发现）
- 发现的 bug：PW-BUG-035（后端 159 处 Errors.* 中文硬编码,P2,tech-debt）
- 扫描规模：84 前端 tsx + 22 后端文件 + 19 admin tsx
- 关键反模式：「后端 Errors.* message 字段直接含中文,无 i18n key」「前端 27/84 已 t() 化但余 57 仍硬编码」「admin 完全无 i18n 基础设施」
- 修复策略（tech-debt,需独立 sprint）：
  1. 后端建 errors-i18n key map + Errors 工厂改造
  2. 前端剩余 57 tsx 接入 useTranslation
  3. admin 19 tsx 接入 i18next
  4. 补 errors.json 缺失 RATE_LIMIT_EXCEEDED key
