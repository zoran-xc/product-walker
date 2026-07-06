import { z } from 'zod'

// 体验路径定义：描述 agent 应该怎么走某个产品流程
// 由 orchestrator / hunter 生成，explorer 消费
export const pathSchema = z.object({
  // 形如 PW-AUTH-001，全局唯一，单调递增
  id: z.string(),
  name: z.string(),
  // 所属模块（auth / chat / billing ...）
  module: z.string(),
  // 体验目标（一句话）
  goal: z.string(),
  perspective: z.enum(['happy', 'real-user', 'cross-module', 'external-env', 'variant']),
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
    // 期望结果
    expected: z.string(),
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
