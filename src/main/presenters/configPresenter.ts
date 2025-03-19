import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// 在 ConfigPresenter 类中添加这个方法
async saveWebAppIcon(file: any, appId: string): Promise<string> {
  try {
    // 创建图标目录
    const iconDir = path.join(app.getPath('userData'), 'webAppIcons')
    if (!fs.existsSync(iconDir)) {
      fs.mkdirSync(iconDir, { recursive: true })
    }

    // 从渲染进程传来的文件对象中提取数据
    // 注意：由于IPC限制，我们需要处理Buffer或Base64字符串
    let buffer: Buffer

    if (file.data) {
      // 如果文件包含data属性（可能是Buffer或Base64）
      if (Buffer.isBuffer(file.data)) {
        buffer = file.data
      } else if (typeof file.data === 'string' && file.data.startsWith('data:')) {
        // 处理Base64数据URL
        const base64Data = file.data.split(',')[1]
        buffer = Buffer.from(base64Data, 'base64')
      } else {
        throw new Error('无效的文件数据格式')
      }
    } else {
      throw new Error('文件数据缺失')
    }

    // 生成图标文件路径
    const ext = path.extname(file.name || '') || '.png'
    const iconFileName = `${appId}${ext}`
    const iconPath = path.join(iconDir, iconFileName)

    // 将文件保存到本地
    fs.writeFileSync(iconPath, buffer)

    // 返回文件URL
    return `app://local/${iconFileName}`
  } catch (error) {
    console.error('保存图标失败:', error)
    throw error
  }
}
