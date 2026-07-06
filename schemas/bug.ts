import { z } from 'zod'

// bug 记录：explorer 上报 + verifier 验证结论
export const bugSchema = z.object({
  // 形如 PW-BUG-001
  id: z.string(),
  sessionId: z.string(),
  pathId: z.string(),
  title: z.string(),
  severity: z.enum(['P0', 'P1', 'P2', 'P3', 'unknown']),
  category: z.enum(['data', 'ui', 'interaction', 'performance', 'crash', 'other']),
  description: z.string(),
  reproduceSteps: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  screenshots: z.array(z.string()),
  domSnapshot: z.string().optional(),
  consoleErrors: z.array(z.string()),
  networkErrors: z.array(z.string()),
  status: z.enum(['reported', 'reproducing', 'confirmed', 'rejected', 'fixing', 'fixed', 'closed']),
  // verifier 的验证结论
  verdict: z.object({
    decision: z.enum(['confirmed', 'rejected', 'needs-info']),
    reason: z.string(),
    reproducedBy: z.string().optional(),
    reproducedAt: z.string().optional(),
  }).optional(),
  metadata: z.object({
    module: z.string(),
    // 涉及的端（web/admin/desktop/server）
    endpoints: z.array(z.string()),
    versions: z.array(z.string()),
    reportedAt: z.string(),
    reportedBy: z.string(),
  }),
})

export type Bug = z.infer<typeof bugSchema>
