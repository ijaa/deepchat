import { BrowserWindow, shell, app, nativeImage, screen } from 'electron'
import { join } from 'path'
import icon from '../../../resources/icon.png?asset'
import iconWin from '../../../resources/icon.ico?asset'
import { is } from '@electron-toolkit/utils'
import { eventBus } from '@/eventbus'
import { ConfigPresenter } from './configPresenter'
import { TrayPresenter } from './trayPresenter'
import { CONFIG_EVENTS, WINDOW_EVENTS } from '@/events'
import contextMenu from '../contextMenuHelper'
import { getContextMenuLabels } from '@shared/i18n'
import { presenter } from '.'

// 定义接口
interface IWindowPresenter {
  windows: Map<string, BrowserWindow>
  getWindow(windowName: string): BrowserWindow | undefined
  mainWindow: BrowserWindow | undefined
  previewFile(filePath: string): void
  minimize(): void
  maximize(): void
  close(): void
  hide(): void
  show(): void
  isMaximized(): boolean
  openWebApp(webApp: { id: string; name: string; url: string; icon: string }): BrowserWindow
}

export const MAIN_WIN = 'main'
export class WindowPresenter implements IWindowPresenter {
  windows: Map<string, BrowserWindow>
  private configPresenter: ConfigPresenter
  private isQuitting: boolean = false
  private trayPresenter: TrayPresenter | null = null
  private contextMenuDisposer?: () => void
  private isAutoHideEnabled: boolean = true
  private autoHideTimer: NodeJS.Timeout | null = null
  private showTimer: NodeJS.Timeout | null = null
  private originalBounds: { x: number; y: number; width: number; height: number } | null = null
  private isFirstShow: boolean = true

  constructor(configPresenter: ConfigPresenter) {
    this.windows = new Map()
    this.configPresenter = configPresenter

    // 检查是否为第二个实例
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
      app.quit()
      return
    }

    // 处理第二个实例的启动
    app.on('second-instance', () => {
      const mainWindow = this.mainWindow
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
      }
    })

    // 监听应用退出事件
    app.on('before-quit', () => {
      console.log('before-quit')
      this.isQuitting = true
      if (this.trayPresenter) {
        this.trayPresenter.destroy()
      }
    })

    // 监听强制退出事件
    eventBus.on(WINDOW_EVENTS.FORCE_QUIT_APP, () => {
      this.isQuitting = true
      if (this.trayPresenter) {
        this.trayPresenter.destroy()
      }
    })

    eventBus.on(CONFIG_EVENTS.SETTING_CHANGED, (key, value) => {
      if (key === 'language') {
        this.resetContextMenu(value as string)
      }
    })

    // 监听内容保护设置变化
    eventBus.on(CONFIG_EVENTS.CONTENT_PROTECTION_CHANGED, (enabled: boolean) => {
      if (this.mainWindow) {
        // 发送通知告知应用程序将重启
        console.log('Content protection setting changed to:', enabled, 'Restarting app...')

        // 延迟一点时间以确保设置已保存并且用户能看到对话框的反馈
        setTimeout(() => {
          presenter.devicePresenter.restartApp()
        }, 1000)
      }
    })

    // 监听鼠标移动事件来检测是否需要显示窗口
    eventBus.on(WINDOW_EVENTS.ENABLE_AUTO_HIDE, (enabled: boolean) => {
      console.log('ENABLE_AUTO_HIDE', enabled)
      if (enabled) {
        this.enableAutoHide()
      } else {
        this.disableAutoHide()
      }
    })

    console.log('WindowPresenter constructor', this.configPresenter)
  }

  createMainWindow(): BrowserWindow {
    const iconFile = nativeImage.createFromPath(process.platform === 'win32' ? iconWin : icon)
    const mainWindow = new BrowserWindow({
      width: 1024,
      height: 620,
      show: false,
      autoHideMenuBar: true,
      icon: iconFile,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: {
        x: 8,
        y: 10
      },
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        devTools: is.dev
      },
      frame: false
    })
    // 获取内容保护设置的值
    const contentProtectionEnabled = this.configPresenter.getContentProtectionEnabled()
    // 更新内容保护设置
    this.updateContentProtection(mainWindow, contentProtectionEnabled)

    mainWindow.on('ready-to-show', () => {
      console.log('ready-to-show trigger')
      mainWindow.show()
      eventBus.emit(WINDOW_EVENTS.READY_TO_SHOW, mainWindow)

      // 窗口显示后，自动隐藏到屏幕右边缘，但只在首次加载时执行
      if (this.isAutoHideEnabled && this.isFirstShow) {
        // 保存原始窗口位置和大小（如果尚未保存）
        if (!this.originalBounds) {
          const bounds = mainWindow.getBounds()
          this.originalBounds = { ...bounds }
        }

        // 延迟一点时间，确保窗口完全显示后再隐藏
        setTimeout(() => {
          console.log('ready-to-show 延迟一点时间，确保窗口完全显示后再隐藏')
          this.hideWindowToEdge(mainWindow)
        }, 1000)

        // 设置标志表示窗口已经首次显示
        this.isFirstShow = false
      }
    })

    // 监听窗口移动事件
    mainWindow.on('moved', () => {
      if (this.isAutoHideEnabled) {
        this.checkWindowPosition()
      }
    })

    // 处理关闭按钮点击
    mainWindow.on('close', (e) => {
      eventBus.emit('main-window-close', mainWindow)
      console.log('main-window-close', this.isQuitting, e)
      if (!this.isQuitting) {
        e.preventDefault()
        if (mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(false)
        }
        mainWindow.hide()
      }
    })

    mainWindow.on('closed', () => {
      this.windows.delete(MAIN_WIN)
      eventBus.emit('main-window-closed', mainWindow)
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Add handler for regular link clicks
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        if (url.startsWith(process.env['ELECTRON_RENDERER_URL'] || '')) {
          return
        }
      }
      // 检查是否为外部链接
      const isExternal = url.startsWith('http:') || url.startsWith('https:')
      if (isExternal) {
        event.preventDefault()
        shell.openExternal(url)
      }
      // 内部路由变化则不阻止
    })

    mainWindow.on('show', () => {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
    })

    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
    this.windows.set(MAIN_WIN, mainWindow)

    // 初始化托盘
    if (!this.trayPresenter) {
      this.trayPresenter = new TrayPresenter(this)
    }

    const lang = this.configPresenter.getSetting<string>('language')
    this.resetContextMenu(lang || app.getLocale())

    // 如果启用了自动隐藏功能，开始监听鼠标移动
    if (this.isAutoHideEnabled) {
      console.log('启用自动隐藏功能并开始监听鼠标移动')
      this.startMouseTracking()
    }

    return mainWindow
  }

  // 添加更新内容保护的方法
  private updateContentProtection(window: BrowserWindow, enabled: boolean): void {
    console.log('更新窗口内容保护状态:', enabled)
    if (enabled) {
      window.setContentProtection(enabled)
      window.webContents.setBackgroundThrottling(!enabled)
      window.webContents.setFrameRate(60)
      if (process.platform === 'darwin') {
        window.setHiddenInMissionControl(enabled)
        window.setSkipTaskbar(enabled)
      }
    }
    // 如果关闭内容保护，则使用默认设置
  }

  getWindow(windowName: string): BrowserWindow | undefined {
    return this.windows.get(windowName)
  }

  get mainWindow(): BrowserWindow | undefined {
    return this.getWindow(MAIN_WIN)
  }

  previewFile(filePath: string): void {
    const window = this.mainWindow
    if (window) {
      if (process.platform === 'darwin') {
        window.previewFile(filePath)
      } else {
        shell.openPath(filePath)
      }
    }
  }

  minimize(): void {
    const window = this.mainWindow
    if (window) {
      window.minimize()
    }
  }

  maximize(): void {
    const window = this.mainWindow
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  }

  close(): void {
    const window = this.mainWindow
    if (window) {
      window.close()
    }
  }

  hide(): void {
    const window = this.mainWindow
    if (window) {
      window.hide()
    }
  }

  show(): void {
    const window = this.mainWindow
    if (window) {
      window.show()
    }
  }

  isMaximized(): boolean {
    const window = this.mainWindow
    return window ? window.isMaximized() : false
  }

  async resetContextMenu(lang: string): Promise<void> {
    const locale = lang === 'system' ? app.getLocale() : lang
    console.log('resetContextMenu', locale)
    if (this.contextMenuDisposer) {
      this.contextMenuDisposer()
      this.contextMenuDisposer = undefined
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    const window = this.mainWindow
    if (window) {
      const labels = getContextMenuLabels(locale)
      this.contextMenuDisposer = contextMenu({
        window: window,
        shouldShowMenu(event, params) {
          console.log('shouldShowMenu 被调用:', params.x, params.y, params.mediaType, event)
          return true
        },
        labels
      })
    } else {
      console.error('无法重置上下文菜单: 找不到主窗口')
    }
  }

  // 检查窗口位置，决定是否自动隐藏
  private checkWindowPosition(): void {
    const mainWindow = this.mainWindow
    if (!mainWindow) return

    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const displayBounds = display.workArea
    const mousePos = screen.getCursorScreenPoint()
    const rightEdge = displayBounds.x + displayBounds.width

    // 如果窗口右边缘紧贴或超出屏幕
    if (bounds.x + bounds.width >= rightEdge - 1) {
      // 保存原始位置（如果尚未保存）
      if (!this.originalBounds) {
        this.originalBounds = { ...bounds }
      }

      // 检查鼠标是否在窗口区域内
      const isMouseInWindow =
        mousePos.x >= bounds.x &&
        mousePos.x <= bounds.x + bounds.width &&
        mousePos.y >= bounds.y &&
        mousePos.y <= bounds.y + bounds.height

      // 如果鼠标在窗口区域内，不要隐藏窗口
      if (isMouseInWindow) {
        console.log('鼠标在窗口区域内，不隐藏窗口')
        // 清除可能存在的隐藏定时器
        if (this.autoHideTimer) {
          clearTimeout(this.autoHideTimer)
          this.autoHideTimer = null
        }
        return
      } else {
        console.log('鼠标不在窗口区域内，设置定时器延迟隐藏窗口')
      }

      // 设置定时器延迟隐藏窗口，避免用户意外触发
      if (this.autoHideTimer) {
        clearTimeout(this.autoHideTimer)
      }

      this.autoHideTimer = setTimeout(() => {
        // 再次检查鼠标位置，确保鼠标不在窗口区域内
        const currentMousePos = screen.getCursorScreenPoint()
        const currentBounds = mainWindow.getBounds()
        const isMouseStillInWindow =
          currentMousePos.x >= currentBounds.x &&
          currentMousePos.x <= currentBounds.x + currentBounds.width &&
          currentMousePos.y >= currentBounds.y &&
          currentMousePos.y <= currentBounds.y + currentBounds.height

        if (isMouseStillInWindow) {
          console.log('鼠标仍在窗口区域内，取消隐藏')
          return
        }

        console.log('隐藏窗口')
        // 使用共享方法隐藏窗口
        this.hideWindowToEdge(mainWindow)
      }, 300)
    }
  }

  // 添加打开网址应用的方法
  openWebApp(webApp: { id: string; name: string; url: string; icon: string }): BrowserWindow {
    const existingWindow = this.windows.get(`webapp-${webApp.id}`)
    if (existingWindow) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore()
      }
      existingWindow.focus()
      return existingWindow
    }

    // 完全禁用自动隐藏功能
    const wasAutoHideEnabled = this.isAutoHideEnabled
    this.disableAutoHide()

    // 确保主窗口可见并恢复到原始位置
    const mainWindow = this.mainWindow
    if (mainWindow && this.originalBounds) {
      mainWindow.setBounds(this.originalBounds)
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      // 确保不会触发自动隐藏
      this.isFirstShow = false
    }

    // 创建新窗口
    const webAppWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      title: webApp.name,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 加载URL
    webAppWindow.loadURL(webApp.url)

    // 添加导航方法
    webAppWindow.webContents.on('did-finish-load', () => {
      // 再次确保主窗口在网页加载完成后仍然可见
      const mainWindow = this.mainWindow
      if (mainWindow && this.originalBounds) {
        mainWindow.setBounds(this.originalBounds)
        if (!mainWindow.isVisible()) {
          mainWindow.show()
        }
      }
    })

    // 监听网站应用窗口的焦点变化
    webAppWindow.on('focus', () => {
      // 当网站应用窗口获得焦点时，确保自动隐藏功能保持禁用状态
      console.log('网站应用窗口获得焦点, ', this.isAutoHideEnabled)
      if (this.isAutoHideEnabled) {
        this.disableAutoHide()
      }
    })

    // 窗口关闭时清理并恢复自动隐藏功能
    webAppWindow.on('closed', () => {
      this.windows.delete(`webapp-${webApp.id}`)

      // 检查是否还有其他网站应用窗口打开
      let hasOtherWebApps = false
      this.windows.forEach((_, key) => {
        if (key.startsWith('webapp-') && key !== `webapp-${webApp.id}`) {
          hasOtherWebApps = true
        }
      })

      // 如果没有其他网站应用窗口，并且之前启用了自动隐藏，则恢复自动隐藏功能
      if (!hasOtherWebApps && wasAutoHideEnabled) {
        // 延迟一点时间再恢复自动隐藏，避免立即触发
        setTimeout(() => {
          this.enableAutoHide()
        }, 1000)
      }
    })

    this.windows.set(`webapp-${webApp.id}`, webAppWindow)
    return webAppWindow
  }

  // 启用自动隐藏功能
  enableAutoHide(): void {
    if (this.isAutoHideEnabled) return

    this.isAutoHideEnabled = true
    console.log('启用窗口自动隐藏功能')

    const mainWindow = this.mainWindow
    if (!mainWindow) return

    // 保存原始窗口位置和大小
    const bounds = mainWindow.getBounds()
    this.originalBounds = { ...bounds }

    // 开始监听鼠标移动
    this.startMouseTracking()
  }

  // 禁用自动隐藏功能
  disableAutoHide(): void {
    if (!this.isAutoHideEnabled) return

    this.isAutoHideEnabled = false
    console.log('禁用窗口自动隐藏功能')

    // 停止监听鼠标移动
    this.stopMouseTracking()

    // 如果窗口处于隐藏状态，恢复到原始位置
    const mainWindow = this.mainWindow
    if (mainWindow && this.originalBounds) {
      mainWindow.setBounds(this.originalBounds)
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
    }
  }

  // 开始监听鼠标移动
  private startMouseTracking(): void {
    console.log('开始监听鼠标移动')

    // 清除可能存在的旧定时器
    this.stopMouseTracking()

    const checkMousePosition = () => {
      if (!this.isAutoHideEnabled) return

      const mousePos = screen.getCursorScreenPoint()
      const displays = screen.getAllDisplays()

      // 检查所有显示器的右边缘
      for (const display of displays) {
        const displayBounds = display.workArea
        const rightEdge = displayBounds.x + displayBounds.width

        // 如果鼠标在屏幕右边缘附近（10像素范围内）
        if (Math.abs(mousePos.x - rightEdge) < 10) {
          console.log('鼠标在屏幕右边缘，尝试显示窗口')
          this.showWindowIfHidden()
          break
        }
      }

      // 继续监听
      if (this.isAutoHideEnabled) {
        setTimeout(checkMousePosition, 200) // 每200ms检查一次
      }
    }

    // 立即开始检查
    checkMousePosition()
  }

  // 停止监听鼠标移动
  private stopMouseTracking(): void {
    // 清除所有定时器
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer)
      this.autoHideTimer = null
    }

    if (this.showTimer) {
      clearTimeout(this.showTimer)
      this.showTimer = null
    }
  }

  // 如果窗口被隐藏，则显示窗口
  private showWindowIfHidden(): void {
    const mainWindow = this.mainWindow
    if (!mainWindow || !this.originalBounds) return

    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const displayBounds = display.workArea

    // 检查窗口是否处于隐藏状态（大部分在屏幕外）
    if (bounds.x > displayBounds.x + displayBounds.width - 20) {
      console.log('窗口处于隐藏状态，准备显示')

      // 设置定时器延迟显示窗口，避免用户意外触发
      if (this.showTimer) {
        clearTimeout(this.showTimer)
      }

      this.showTimer = setTimeout(() => {
        // 计算新的窗口位置，使右侧边框紧贴屏幕右边缘
        const newX = displayBounds.x + displayBounds.width - this.originalBounds!.width

        // 设置新的窗口位置和大小
        mainWindow.setBounds({
          x: newX,
          y: this.originalBounds!.y,
          width: this.originalBounds!.width,
          height: this.originalBounds!.height
        })

        // 确保窗口可见并置顶
        if (!mainWindow.isVisible()) {
          mainWindow.show()
        }
        mainWindow.setAlwaysOnTop(true)

        console.log('窗口已显示并置顶，右侧紧贴屏幕边缘')

        // 添加一个短暂的延迟，防止窗口立即再次隐藏
        setTimeout(() => {
          // 在窗口显示后，添加一个事件监听器来检测鼠标是否离开窗口
          const checkMouseLeave = () => {
            console.log('检查鼠标是否离开窗口, ', this.isAutoHideEnabled)
            if (!this.isAutoHideEnabled) return

            const mousePos = screen.getCursorScreenPoint()
            const windowBounds = mainWindow.getBounds()

            // 检查鼠标是否在窗口外
            const isMouseOutsideWindow =
              mousePos.x < windowBounds.x ||
              mousePos.x > windowBounds.x + windowBounds.width ||
              mousePos.y < windowBounds.y ||
              mousePos.y > windowBounds.y + windowBounds.height

            if (isMouseOutsideWindow) {
              console.log('鼠标离开窗口区域，取消置顶并触发位置检查')
              // 取消窗口置顶
              mainWindow.setAlwaysOnTop(false)
              // 鼠标离开窗口，触发位置检查
              this.checkWindowPosition()
              return
            }

            // 继续检查
            setTimeout(checkMouseLeave, 300)
          }

          // 开始检查鼠标是否离开窗口
          checkMouseLeave()
        }, 200)
      }, 100)
    }
  }

  // 将窗口隐藏到屏幕右边缘
  private hideWindowToEdge(window: BrowserWindow): void {
    if (!window) return

    const bounds = window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const displayBounds = display.workArea

    // 保存原始位置（如果尚未保存）
    if (!this.originalBounds) {
      this.originalBounds = { ...bounds }
    }

    console.log('自动隐藏窗口到屏幕右边缘')

    // 隐藏窗口（只留出小部分）
    const hiddenX = displayBounds.x + displayBounds.width - 5 // 只留5像素在屏幕上
    window.setBounds({
      x: hiddenX,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
  }
}
