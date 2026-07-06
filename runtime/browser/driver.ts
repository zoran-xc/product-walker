// 浏览器控制抽象层：所有 driver（playwright / cdp / tauri）实现此接口
// explorer 只面向接口编程，不关心底层实现
export interface BrowserDriver {
  // 启动浏览器或连接已开实例
  launch(): Promise<void>
  // 导航到 URL
  goto(url: string): Promise<void>
  // 点击元素
  click(selector: string): Promise<void>
  // 在输入框输入文本
  type(selector: string, text: string): Promise<void>
  // 截图，返回 Buffer
  screenshot(): Promise<Buffer>
  // DOM 快照，返回 outerHTML
  domSnapshot(): Promise<string>
  // 收集 console 错误
  consoleErrors(): Promise<string[]>
  // 收集网络错误（请求失败 + 4xx/5xx）
  networkErrors(): Promise<string[]>
  // 关闭浏览器 / 断开连接
  close(): Promise<void>
}

// driver 类型枚举
export type DriverType = 'playwright' | 'cdp' | 'tauri'

// 创建 driver 的选项
export interface DriverOptions {
  // 是否无头，默认 true
  headless?: boolean
  // CDP 端口，默认 9222
  cdpPort?: number
  // 慢动作（毫秒），调试用
  slowMo?: number
}
