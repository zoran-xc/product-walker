# 设计系统对齐扫描清单

> 横向扫描全代码库的 className，找出违反设计系统状态层规约的可交互元素。
>
> **触发信号**：发现 1 个 button/a/可点击元素缺 hover/focus/transition 类 → 全代码库扫描同类模式。

## 何时触发

- 发现某 button className 仅 layout 类，无 `hover:*` / `focus-visible:ring` / `transition-colors`
- 设计系统 spec 明确要求交互态叠加 + focus-visible 环
- 代码库自身模式不一致（部分按钮有 hover，部分没有）

## 检查项

### 1. 主操作按钮 hover 反馈

- [ ] 所有 `<button>` 主操作（保存/提交/确认/删除）className 含 `hover:*`
- [ ] 实色 `bg-primary` 按钮加 `hover:bg-primary/90` 或类似
- [ ] Ghost 按钮加 `hover:bg-secondary-button` 或类似
- [ ] Icon-only 按钮加 `hover:bg-*` 提供视觉反馈

**案例**：yonder PW-BUG-017（ConversationView 重试按钮无 hover）、PW-BUG-018（ClaudeCredentialsSection 3 个保存按钮无 hover）

### 2. 列表项 hover 反馈

- [ ] 所有可点击列表项（会话/联系人/Agent/Session）className 含 `hover:*`
- [ ] hover 时背景色变化（`.08 叠加` 或 `bg-secondary-button`）
- [ ] 长列表中 hover 帮助用户定位当前指向项

**案例**：yonder PW-BUG-019（GroupsTab/PeopleTab/AgentsTab/SessionList 列表项普遍无 hover）

### 3. focus-visible 键盘可访问性

- [ ] 所有原生 `<button>` 含 `focus-visible:ring-2 focus-visible:ring-ring`
- [ ] 链接 `<a>` 含 `focus-visible:ring-*`
- [ ] role="button" 的可点击 div 含 `focus-visible:ring-*`
- [ ] 用 design-system `<Button>` 组件的可豁免（自身已封装）

**案例**：yonder PW-BUG-020（~62 处原生 button 缺 focus-visible，违反 WCAG 2.4.7）

### 4. transition 过渡

- [ ] 所有 hover 类配合 `transition-colors` 或 `transition`
- [ ] 避免 hover 状态突变（无 transition 会闪烁）

### 5. 设计系统规约本身

- [ ] §5 状态层规约是否清晰（hover 叠加值、focus 环类名）
- [ ] §6 a11y 规约是否可执行（focus-visible 具体类名）
- [ ] 移动端是否豁免 hover（touch 设备无 hover 事件）
- [ ] 原生 button vs design-system Button 边界是否明确

## 扫描方法

1. **Grep 全代码库**：
   - `<button` 找所有 button 标签
   - `onClick=` 找所有可点击元素
   - `role="button"` 找 ARIA 角色按钮
   - `<a ` 找所有链接
2. **对每个匹配提取 className**：用 Grep -A 5 看上下文
3. **判断缺失**：
   - 缺 `hover:` → 标记「缺 hover」
   - 缺 `focus-visible:ring` 或 `focus:` → 标记「缺 focus」
   - 缺 `transition` → 标记「缺 transition」
4. **排除合理例外**：
   - 用 design-system `<Button>` 组件的豁免
   - 纯装饰性 div（无 onClick）豁免
   - asChild 透传的豁免
5. **按严重度分类**：
   - P2：主操作按钮缺 hover
   - P3：次要按钮缺 hover
   - P3：缺 focus-visible（键盘可访问性）

## 产出格式

扫描报告含以下章节：

1. **扫描摘要**：文件数 / 元素总数 / 违规总数 / 严重度分布
2. **违规清单**：表格（文件:行 / 元素 / className 现状 / 缺什么 / 严重度 / 建议补的类）
3. **重复模式归纳**：哪些 className 模式反复出现违规
4. **新 bug 上报**：高风险单独上报，低风险汇总
5. **设计系统规约反馈**：如规约本身模糊，建议改 design-system-spec

## yonder 案例参考

- 报告：`product-walker/reports/PW-SCAN-design-system-alignment.md`
- 触发 bug：PW-BUG-017（重试按钮无 hover）
- 发现的 bug：PW-BUG-017（已修）、PW-BUG-018（ClaudeCredentialsSection 3 保存按钮）、PW-BUG-019（列表项普遍无 hover）、PW-BUG-020（~62 处缺 focus-visible）
- 扫描规模：32 文件 / 79 元素 / 76 违规
- 关键反模式：「列表项 button 无 hover」「有 hover 但缺 focus-visible」
