import { chromium, type Browser, type Page } from 'playwright'
import type { BrowserDriver, DriverOptions } from './driver.js'

// CDP driver：连接用户已开的 Chrome（默认端口 9222）
// 适合测「真实环境」（用户已登录态、真实扩展、真实缓存）
// 骨架实现：用 Playwright 的 connectOverCDP
export class CDPDriver implements BrowserDriver {
  private browser: Browser | null = null
  private page: Page | null = null
  private consoleErrors: string[] = []
  private networkErrors: string[] = []
  private readonly options: DriverOptions

  constructor(options: DriverOptions = {}) {
    this.options = options
  }

  async launch(): Promise<void> {
    const port = this.options.cdpPort ?? 9222
    const endpoint = `http://127.0.0.1:${port}`
    // 连接用户已开的 Chrome（需以 --remote-debugging-port=9222 启动）
    this.browser = await chromium.connectOverCDP(endpoint)
    const contexts = this.browser.contexts()
    const context = contexts[0] ?? await this.browser.newContext()
    const pages = context.pages()
    this.page = pages[0] ?? await context.newPage()
    // TODO: 复用 PlaywrightDriver 的事件监听逻辑（可抽到基类或 mixin）
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(`[console] ${msg.text()}`)
      }
    })
    this.page.on('pageerror', (err) => {
      this.consoleErrors.push(`[pageerror] ${err.message}`)
    })
    this.page.on('requestfailed', (req) => {
      this.networkErrors.push(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`)
    })
    this.page.on('response', (res) => {
      const status = res.status()
      if (status >= 400) {
        this.networkErrors.push(`[response ${status}] ${res.url()}`)
      }
    })
  }

  async goto(url: string): Promise<void> {
    if (!this.page) throw new Error('driver 未启动，先调用 launch()')
    await this.page.goto(url)
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('driver 未启动')
    await this.page.click(selector)
  }

  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('driver 未启动')
    await this.page.fill(selector, text)
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page) throw new Error('driver 未启动')
    return await this.page.screenshot({ fullPage: true })
  }

  async domSnapshot(): Promise<string> {
    if (!this.page) throw new Error('driver 未启动')
    return await this.page.evaluate(() => document.documentElement.outerHTML)
  }

  async consoleErrors(): Promise<string[]> {
    return [...this.consoleErrors]
  }

  async networkErrors(): Promise<string[]> {
    return [...this.networkErrors]
  }

  async close(): Promise<void> {
    // CDP 模式只断开连接，不关闭用户的浏览器
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
