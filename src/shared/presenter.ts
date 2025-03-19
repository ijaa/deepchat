// 添加网址应用的数据模型
export interface WebAppItem {
  id: string
  name: string
  url: string
  icon: string
  enabled: boolean
}

// 更新 IConfigPresenter 接口，添加网址应用相关方法
export interface IConfigPresenter {
  // 现有方法...
  getWebApps(): Promise<WebAppItem[]>
  setWebApps(webApps: WebAppItem[]): Promise<void>
  saveWebAppIcon(file: File, appId: string): Promise<string>
}
