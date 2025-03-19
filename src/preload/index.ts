import { clipboard, contextBridge, ipcRenderer, webUtils } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  copyText: (text: string) => {
    clipboard.writeText(text)
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  }
}
exposeElectronAPI()

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('deepChatApi', api)
    contextBridge.exposeInMainWorld('electronAPI', {
      ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => {
          const validChannels = [
            // 现有频道...
            'open-web-app',
            'open-external-url',
            'create-web-view',
            'destroy-web-view',
            'resize-web-view',
            'navigate-web-view',
            'get-web-view-navigation-state',
            'web-view-go-back',
            'web-view-go-forward',
            'web-view-reload'
          ]
          if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args)
          }
        },
        on: (channel: string, listener: (...args: unknown[]) => void) => {
          const validChannels = [
            // 现有频道...
            'web-apps-updated',
            'web-view-created',
            'web-view-loading',
            'web-view-url-changed',
            'web-view-navigation-state'
          ]
          if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, listener)
          }
        }
      }
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.deepChatApi = api
}
