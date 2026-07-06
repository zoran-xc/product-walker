import { z } from 'zod'

// 体验路径定义：描述 agent 应该怎么走某个产品流程
// 由 orchestrator / hunter 生成，explorer 消费
// 支持分层编号 + 多轮迭代：
//   一级 PW-AUTH-001（L1 模块级，round=1）
//   二级 PW-AUTH-001.002（L2 流程级，round=2，从 001 延伸）
//   三级 PW-AUTH-001.002.003（L3 交互级，round=3，从 001.002 延伸）
//   四级 PW-AUTH-001.002.003.004（L4 视觉级，round=4）
// dot 分隔保证字典序排列时父路径在子路径前
export const pathSchema = z.object({
  // 形如 PW-AUTH-001（一级）或 PW-AUTH-001.002（二级）或 PW-AUTH-001.002.003（三级）
  // 全局唯一；dot 分隔表示树状延伸
  id: z.string().regex(/^PW-[A-Z]+-\d+(\.\d+)*$/, 'id 必须形如 PW-AUTH-001 或 PW-AUTH-001.002'),
  name: z.string(),
  // 所属模块（auth / chat / billing ...）
  module: z.string(),
  // 体验目标（一句话）
  goal: z.string(),
  perspective: z.enum(['happy', 'real-user', 'cross-module', 'external-env', 'variant']),
  // 层级深度：1=模块级(L1 粗), 2=流程级(L2 中), 3=交互级(L3 细), 4=视觉级(L4 微)
  // 一级路径 depth=1；从一级延伸的二级 depth=2；以此类推
  depth: z.number().int().min(1).max(10).default(1),
  // 父路径 id（一级路径为 null；二级路径的 parentId 是其一级路径 id）
  parentId: z.string().nullable().default(null),
  // 根路径 id（一级路径的 rootId = 自身 id；二级及以下继承一级的 id）
  rootId: z.string().optional(),
  // 粒度标签：L1 模块级 / L2 流程级 / L3 交互级 / L4 视觉级
  granularity: z.enum(['L1', 'L2', 'L3', 'L4']).default('L1'),
  // 第几轮跑出来的（1=第一轮主流程, 2=第二轮细粒度延伸, 3=第三轮交互级, 4=第四轮视觉级）
  round: z.number().int().min(1).default(1),
  prerequisites: z.array(z.object({
    type: z.enum(['auth', 'data', 'env', 'state']),
    description: z.string(),
  })),
  steps: z.array(z.object({
    id: z.string(),
    // 自然语言描述的动作
    action: z.string(),
    // 选择器 / URL，可选
    target: z.string().optional(),
    // 期望结果（自然语言）
    expected: z.string(),
    // 细粒度断言（L3/L4 用）：精确到元素属性/文本/状态的可验证断言
    // L1/L2 可为空；L3/L4 必填至少 1 条
    assertions: z.array(z.object({
      // 断言类型
      type: z.enum(['visible', 'hidden', 'text', 'attribute', 'class', 'style', 'count', 'state', 'network', 'console']),
      // 目标元素选择器或网络请求 URL 模式
      target: z.string(),
      // 期望值（text=确切文案 / attribute=属性值 / class=类名包含 / count=数字 / state=disabled|enabled|loading|...）
      expected: z.string(),
      // 可选：断言失败时的严重度（默认 P2）
      severity: z.enum(['P0', 'P1', 'P2', 'P3']).default('P2'),
    })).default([]),
  })),
  // 整条路径走完的期望结果
  expectedOutcome: z.string(),
  metadata: z.object({
    createdAt: z.string(),
    // agent id
    createdBy: z.string(),
    version: z.string(),
  }),
})

export type Path = z.infer<typeof pathSchema>
