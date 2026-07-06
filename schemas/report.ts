import { z } from 'zod'

// 聚合报告：一次体验测试的总结
export const reportSchema = z.object({
  id: z.string(),
  module: z.string(),
  period: z.object({ start: z.string(), end: z.string() }),
  pathsTotal: z.number(),
  pathsCompleted: z.number(),
  bugsReported: z.number(),
  bugsConfirmed: z.number(),
  bugsRejected: z.number(),
  bugsFixed: z.number(),
  agentsInvolved: z.array(z.string()),
  summary: z.string(),
  topBugs: z.array(z.object({
    bugId: z.string(),
    severity: z.string(),
    title: z.string(),
  })),
  // 覆盖率缺口（哪些视角还没覆盖）
  coverageGaps: z.array(z.string()),
  recommendations: z.array(z.string()),
})

export type Report = z.infer<typeof reportSchema>
