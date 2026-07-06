import { chromium, type Browser, type Page } from 'playwright'
import type { BrowserDriver, DriverOptions } from './driver.js'

// Playwright driver：内置浏览器，无副作用，CI 友好
// 完整实现：用 chromium，headless 默认开
export class PlaywrightDriver implements BrowserDriver {
  private browser: Browser | null = null
  private page: Page | null = null
  private consoleErrors: string[] = []
  private networkErrors: string[] = []
  private readonly options: DriverOptions

  constructor(options: DriverOptions = {}) {
    this.options = options
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.options.headless ?? true,
      slowMo: this.options.slowMo ?? 0,
    })
    const context = await this.browser.newContext()
    this.page = await context.newPage()
    // 监听 console 错误
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(`[console] ${msg.text()}`)
      }
    })
    this.page.on('pageerror', (err) => {
      this.consoleErrors.push(`[pageerror] ${err.message}`)
    })
    // 监听网络错误
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
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
