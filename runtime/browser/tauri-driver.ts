import type { BrowserDriver, DriverOptions } from './driver.js'

// Tauri driver：控制 Tauri 桌面端的 WebView2
// 骨架 + TODO：需要 Tauri 暴露 IPC 桥（宿主项目配合）
// 等 Tauri WebView2 控制协议稳定后实现
export class TauriDriver implements BrowserDriver {
  private readonly options: DriverOptions

  constructor(options: DriverOptions = {}) {
    this.options = options
  }

  async launch(): Promise<void> {
    // TODO: 通过 Tauri 的 IPC 桥连接到 WebView2 实例
    // 需要宿主项目在 tauri.conf.json 里开启 inspector，并暴露控制端口
    throw new Error('TauriDriver 尚未实现 - 需 Tauri WebView2 IPC 桥')
  }

  async goto(_url: string): Promise<void> {
    throw new Error('TauriDriver 尚未实现')
  }

  async click(_selector: string): Promise<void> {
    throw new Error('TauriDriver 尚未实现')
  }

  async type(_selector: string, _text: string): Promise<void> {
    throw new Error('TauriDriver 尚未实现')
  }

  async screenshot(): Promise<Buffer> {
    throw new Error('TauriDriver 尚未实现')
  }

  async domSnapshot(): Promise<string> {
    throw new Error('TauriDriver 尚未实现')
  }

  async consoleErrors(): Promise<string[]> {
    throw new Error('TauriDriver 尚未实现')
  }

  async networkErrors(): Promise<string[]> {
    throw new Error('TauriDriver 尚未实现')
  }

  async close(): Promise<void> {
    // TODO: 断开 Tauri IPC 连接
  }
}
