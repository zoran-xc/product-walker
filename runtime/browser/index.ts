import type { BrowserDriver, DriverType, DriverOptions } from './driver.js'
import { PlaywrightDriver } from './playwright-driver.js'
import { CDPDriver } from './cdp-driver.js'
import { TauriDriver } from './tauri-driver.js'

// 工厂函数：根据 type 返回对应的 driver 实例
export function createDriver(type: DriverType, options: DriverOptions = {}): BrowserDriver {
  switch (type) {
    case 'playwright':
      return new PlaywrightDriver(options)
    case 'cdp':
      return new CDPDriver(options)
    case 'tauri':
      return new TauriDriver(options)
    default:
      throw new Error(`未知 driver 类型: ${type as string}`)
  }
}

export type { BrowserDriver, DriverType, DriverOptions } from './driver.js'
export { PlaywrightDriver } from './playwright-driver.js'
export { CDPDriver } from './cdp-driver.js'
export { TauriDriver } from './tauri-driver.js'
