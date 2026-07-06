#!/usr/bin/env node
// product-walker CLI 入口
// 命令：init / run / report
import { initDataDir, listFiles, readJson, writeText } from './storage.js'

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2)

  switch (cmd) {
    case 'init': {
      await initDataDir()
      console.log('product-walker 数据目录已初始化:', process.env.PW_DATA_DIR ?? './product-walker')
      break
    }
    case 'run': {
      const pathId = args[0]
      if (!pathId) {
        console.error('用法: product-walker run <path-id>')
        process.exit(1)
      }
      // CLI 只做调度提示，真正执行由 explorer skill 完成
      console.log(`请用 product-walker-explorer skill 体验路径 ${pathId}`)
      const files = await listFiles('paths')
      console.log('可用路径:', files.join(', ') || '(空)')
      break
    }
    case 'report': {
      const modules = args[0] ? [args[0]] : []
      const bugs = await listFiles('bugs')
      const reports = await listFiles('reports')
      const summary = [
        '# product-walker 体验报告',
        '',
        `- bug 记录: ${bugs.length} 个`,
        `- 已有报告: ${reports.length} 份`,
        modules.length ? `- 模块: ${modules.join(', ')}` : '',
      ].filter(Boolean).join('\n')
      const name = `PW-RPT-${new Date().toISOString().slice(0, 10)}.md`
      await writeText('reports', name, summary)
      console.log('报告已生成:', name)
      break
    }
    case undefined:
    case 'help':
    case '--help': {
      console.log(`product-walker - AI 产品体验师

用法:
  product-walker init                初始化数据目录
  product-walker run <path-id>       指派 explorer 体验某路径
  product-walker report [module]     生成聚合报告

环境变量:
  PW_DATA_DIR   数据目录路径（默认 ./product-walker）`)
      break
    }
    default: {
      console.error('未知命令:', cmd, '（可用: init / run / report / help）')
      process.exit(1)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
