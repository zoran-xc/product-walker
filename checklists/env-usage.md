# 环境变量使用扫描清单

> 横向扫描所有 process.env + import.meta.env 用法,找出散落调用 + 缺校验 + 缺文档化的违规。
>
> **触发信号**：发现 1 处 process.env.XXX 直接用法且不在 config 层 → 全代码库扫描同类模式。

## 何时触发

- 发现某文件直接 `process.env.XXX` 而非走 config 层 → 触发散落扫描
- 发现某 secret 类 env 变量（JWT_SECRET / API_KEY）有弱默认值 → 触发 fail-fast 审计
- 发现某数值字段 `Number(process.env.X)` 无 NaN 兜底 → 触发类型校验扫描
- 发现某 .env.example 覆盖率不足 → 触发文档化审计
- 发现前端代码读后端 secret → 触发前后端边界审计

## 检查项

### 1. central config 层覆盖

- [ ] 后端有 server/src/config/env.ts（或类似）统一加载层
- [ ] 所有 process.env 调用走 config 层（import { env } from '@/config/env'）
- [ ] config 层用 zod schema 一次性解析所有 env 变量
- [ ] secret 类必填 + 生产 fail-fast（缺即 throw）
- [ ] 业务配置类可选 + 有默认值 + 类型校验
- [ ] 前端有 apps/web/src/lib/env.ts 走 import.meta.env.VITE_*

**案例**：yonder PW-BUG-053 后端零 central config 层,82 处 process.env 散落 16 文件

### 2. secret 类 fail-fast

- [ ] JWT_SECRET 在生产环境缺即 throw（不静默用弱默认）
- [ ] CREDENTIAL_ENC_KEY 同型 fail-fast（与 JWT_SECRET 一致）
- [ ] 所有加密 secret 类 env 变量（API_KEY / TOKEN / SECRET）生产必校验
- [ ] 弱默认值（如 'change-me' / 'dev-key'）不能进生产
- [ ] dev 环境保留默认值（不阻断开发）

**案例**：yonder PW-BUG-052 CREDENTIAL_ENC_KEY 用弱默认 'yonder-dev-credential-key-change-me' 无生产 fail-fast（与 PW-BUG-025 JWT_SECRET 同型未修复）

### 3. 类型校验

- [ ] 数值字段（PORT / CPU / MEM / TTL_MS）用 z.number() 或 Number() + NaN 兜底
- [ ] 布尔字段（FLAG_* / SECURE）用 z.boolean() 或 envFlag() 函数
- [ ] URL 字段（DATABASE_URL / REDIS_URL）用 z.string().url()
- [ ] 枚举字段（NODE_ENV / EDITION / PROVIDER）用 z.enum([])
- [ ] 不允许 `process.env.X!` 非空断言（latent crash 风险）

**案例**：yonder PW-SCAN-env-usage 发现多处 `Number()` 静默 NaN（SANDBOX_CPU/MEM/REFERRAL_REWARD_CENTS）+ `!` 断言 latent crash（TENCENT_SMS_SECRET_ID / AUTH_EMAIL_SMTP_PASS）

### 4. .env.example 覆盖率

- [ ] .env.example 覆盖所有代码使用的 env 变量（覆盖率 100%）
- [ ] 无 dead entry（.env.example 列了但代码零引用）
- [ ] secret 类变量在 .env.example 用占位符（如 `JWT_SECRET=change-me-in-prod`）
- [ ] 业务配置类变量在 .env.example 给默认值示例

**案例**：yonder server/.env.example 覆盖率仅 45%（27/60+）,OSS_REGION 是 dead entry

### 5. 前后端边界

- [ ] 前端代码不读 process.env（应走 import.meta.env.VITE_*）
- [ ] 前端不读后端 secret（如 JWT_SECRET / CREDENTIAL_ENC_KEY 不能进 web bundle）
- [ ] vite.config.ts 注入的 __APP_*__ 全局常量是构建期版本号（非 secret）
- [ ] 前端 VITE_* 变量是公开配置（API_BASE_URL / EDITION 等）

**案例**：yonder apps/web/src + apps/desktop/src 零 process.env 直接调用,全走 import.meta.env.VITE_*,边界干净

### 6. 行为一致性

- [ ] 同一 env 变量在不同文件读取时行为一致（如 REDIS_URL 缺则抛错 vs 静默 null）
- [ ] 同一逻辑分支下读取方式一致（如所有 secret 类统一 fail-fast）
- [ ] dev / test / production 三种环境行为差异化处理（用 NODE_ENV 分支）

## 扫描方法

1. **Grep `process\.env\.`**：找所有 process.env 调用
2. **Grep `import\.meta\.env\.`**：找前端 env 调用
3. **提取所有 env 变量名 + 出现位置**
4. **Read config 层文件**：找登记的变量
5. **求差集**：用了但没登记的 env 变量
6. **Read .env.example**：求文档化覆盖率
7. **对每个 env 变量判断**：
   - 是否有默认值
   - 是否有类型校验
   - 是否在前端代码引用（应只读 VITE_ 前缀）
   - 是否 secret 类（应 fail-fast）

## 产出格式

扫描报告含：

1. **扫描摘要**：process.env 总调用数 / 登记 config 层的数 / 散落数 / .env.example 覆盖率
2. **违规清单**：表格（env 变量名 / 出现位置 / 类型 / 是否登记 / 是否文档化 / 风险）
3. **未登记散落分布**：表格（文件 / process.env 调用数 / 涉及变量）
4. **secret 类 fail-fast 审计**：表格（变量名 / 是否有弱默认 / 是否生产 fail-fast）
5. **前后端边界审计**：表格（前端文件 / 是否读 process.env / 是否读后端 secret）
6. **.env.example 覆盖率审计**：未文档化清单 + dead entry 清单
7. **新 bug 上报**：仅高风险（如 secret 类弱默认无 fail-fast / 散落数超 20 处）

## yonder 案例参考

- 报告：`PW-SCAN-env-usage.md`
- 触发 bug：无（横向扫描自主发现）
- 发现的 bug：
  - PW-BUG-052（P1 安全）：CREDENTIAL_ENC_KEY 弱默认无生产 fail-fast（已修,commit f83bb16）
  - PW-BUG-053（P2 系统性）：后端零 central config 层,82 处散落（tech-debt 需独立 sprint）
- 扫描规模：145 行 process.env / 82 处后端散落 / 16 文件 / ~73 独立变量
- 关键反模式：「secret 类 env 变量漏 fail-fast 校验（JWT_SECRET 修了 CREDENTIAL_ENC_KEY 漏修）」「Number() 无 NaN 兜底」「! 非空断言 latent crash」「.env.example 覆盖率 45%」
- 修复策略：
  1. 立即修 P1（CREDENTIAL_ENC_KEY fail-fast）
  2. tech-debt 标记 P2（central config 层重构需独立 sprint）
  3. 前端边界干净（apps/web/src/lib/env.ts 是后端 config 层重构的参照模板）
