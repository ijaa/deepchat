interface Window {
  deepChatApi: {
    copyText: (text: string) => void
    getPathForFile: (file: File) => string
  }
  electronAPI: {
    ipcRenderer: {
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, listener: (...args: unknown[]) => void) => void
    }
  }
}
