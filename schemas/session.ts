import { z } from 'zod'

// 体验会话：explorer 沿路径走的过程记录，是 bug 的证据来源
export const sessionSchema = z.object({
  id: z.string(),
  // 关联的路径 id
  pathId: z.string(),
  // 执行的 agent 标识
  agentId: z.string(),
  status: z.enum(['init', 'running', 'paused', 'completed', 'failed']),
  // 使用的浏览器 driver
  driver: z.enum(['playwright', 'cdp', 'tauri']),
  // 当前走到哪一步
  currentStep: z.string(),
  steps: z.array(z.object({
    stepId: z.string(),
    status: z.enum(['pending', 'running', 'done', 'failed', 'skipped']),
    // 实际观察
    actual: z.string(),
    screenshot: z.string().optional(),
    domSnapshot: z.string().optional(),
    timestamp: z.string(),
  })),
  // agent 自主介入记录（看到可疑 UI 主动点、走不通换条路等）
  interventions: z.array(z.object({
    reason: z.string(),
    action: z.string(),
    result: z.string(),
  })),
  startedAt: z.string(),
  completedAt: z.string().optional(),
})

export type Session = z.infer<typeof sessionSchema>
