import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 文件存储 helper：读写 path/session/bug/report
// 数据目录默认 ./product-walker/，可由 DATA_DIR 环境变量覆盖

export type DataKind = 'paths' | 'sessions' | 'bugs' | 'reports'

export function getDataDir(): string {
  return process.env.PW_DATA_DIR ?? join(process.cwd(), 'product-walker')
}

function dirFor(kind: DataKind): string {
  return join(getDataDir(), kind)
}

// 列出某类下的所有文件名
export async function listFiles(kind: DataKind): Promise<string[]> {
  try {
    const entries = await readdir(dirFor(kind))
    return entries.filter((f) => !f.endsWith('.lock') && !f.startsWith('.'))
  } catch {
    return []
  }
}

// 读取单个文件（返回解析后的对象）
export async function readJson<T = unknown>(kind: DataKind, name: string): Promise<T> {
  const raw = await readFile(join(dirFor(kind), name), 'utf8')
  return JSON.parse(raw) as T
}

// 写入单个文件（带目录自动创建）
export async function writeJson(kind: DataKind, name: string, data: unknown): Promise<void> {
  const filePath = join(dirFor(kind), name)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

// 写入文本（用于 report.md）
export async function writeText(kind: DataKind, name: string, text: string): Promise<void> {
  const filePath = join(dirFor(kind), name)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, text, 'utf8')
}

// 读取文本
export async function readText(kind: DataKind, name: string): Promise<string> {
  return await readFile(join(dirFor(kind), name), 'utf8')
}

// 写入二进制（截图）
export async function writeBuffer(kind: DataKind, name: string, buf: Buffer): Promise<void> {
  const filePath = join(dirFor(kind), name)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, buf)
}

// 初始化数据目录结构
export async function initDataDir(): Promise<void> {
  const root = getDataDir()
  for (const kind of ['paths', 'sessions', 'bugs', 'reports', 'screenshots', 'dom'] as const) {
    await mkdir(join(root, kind), { recursive: true })
  }
}

// 工具：生成下一个递增 id（如 PW-BUG-001 → PW-BUG-002）
export async function nextId(prefix: string, kind: DataKind): Promise<string> {
  const files = await listFiles(kind)
  let max = 0
  for (const f of files) {
    const m = f.match(new RegExp(`${prefix}-(\\d+)`))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

export { fileURLToPath }
