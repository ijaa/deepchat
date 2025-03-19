<template>
  <div class="w-full h-full flex flex-col gap-4 p-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-semibold">{{ t('settings.webApps.title') }}</h2>
      <Button @click="openAddWebAppDialog">
        <Icon icon="lucide:plus" class="mr-2 h-4 w-4" />
        {{ t('settings.webApps.addWebApp') }}
      </Button>
    </div>

    <div class="flex-1 overflow-auto">
      <ScrollArea class="h-full w-full pr-4">
        <div v-if="webApps.length === 0" class="flex flex-col items-center justify-center h-64">
          <Icon icon="lucide:globe" class="h-12 w-12 text-muted-foreground opacity-50" />
          <p class="text-muted-foreground mt-4">{{ t('settings.webApps.noWebApps') }}</p>
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="app in webApps"
            :key="app.id"
            class="flex items-center justify-between p-4 rounded-lg border"
          >
            <div class="flex items-center gap-3">
              <img
                :src="app.icon"
                :alt="app.name"
                class="h-10 w-10 rounded-md object-contain bg-transparent"
                @error="handleIconError($event, app)"
              />
              <div>
                <h3 class="font-medium">{{ app.name }}</h3>
                <p class="text-sm text-muted-foreground truncate max-w-[300px]">{{ app.url }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Switch
                :id="`webapp-switch-${app.id}`"
                :checked="app.enabled"
                @update:checked="toggleWebApp(app)"
              />
              <Button variant="ghost" size="icon" @click="editWebApp(app)">
                <Icon icon="lucide:edit" class="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" @click="confirmDeleteWebApp(app)">
                <Icon icon="lucide:trash" class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>

  <!-- 添加/编辑网址应用弹窗 -->
  <Dialog v-model:open="isAddWebAppDialog">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{
          isEditing ? t('settings.webApps.editWebApp') : t('settings.webApps.addWebApp')
        }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.webApps.webAppDialogDesc') }}
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <!-- 图标上传 -->
        <div class="flex flex-col items-center gap-2">
          <div
            v-if="!webAppForm.icon"
            class="h-16 w-16 rounded-md flex items-center justify-center border border-dashed cursor-pointer"
            @click="triggerIconUpload"
          >
            <Icon icon="lucide:image-plus" class="h-8 w-8 text-muted-foreground" />
          </div>
          <img
            v-else
            :src="webAppForm.icon"
            alt="图标预览"
            class="h-16 w-16 rounded-md object-cover cursor-pointer"
            @click="triggerIconUpload"
            @error="handlePreviewIconError"
          />
          <input
            ref="iconFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleIconUpload"
          />
          <p class="text-sm text-muted-foreground">
            {{ t('settings.webApps.iconRequired') }}
          </p>
        </div>

        <!-- 名称输入 -->
        <div class="grid gap-2">
          <Label for="name">{{ t('settings.webApps.name') }}</Label>
          <Input
            id="name"
            v-model="webAppForm.name"
            :placeholder="t('settings.webApps.namePlaceholder')"
          />
        </div>

        <!-- URL输入 -->
        <div class="grid gap-2">
          <Label for="url">{{ t('settings.webApps.url') }}</Label>
          <Input
            id="url"
            v-model="webAppForm.url"
            :placeholder="t('settings.webApps.urlPlaceholder')"
            :class="{ 'border-destructive': urlError }"
            @input="urlError = false"
          />
          <p v-if="urlError" class="text-sm text-destructive">
            {{ t('settings.webApps.invalidUrl') }}
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeAddWebAppDialog">
          {{ t('dialog.cancel') }}
        </Button>
        <Button :disabled="!isValidForm" @click="saveWebApp">
          {{ t('dialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 删除确认弹窗 -->
  <Dialog v-model:open="isDeleteDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('settings.webApps.deleteWebApp') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.webApps.deleteWebAppDesc', { name: webAppToDelete?.name }) }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="isDeleteDialogOpen = false">
          {{ t('dialog.cancel') }}
        </Button>
        <Button variant="destructive" @click="deleteWebApp">
          {{ t('dialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { nanoid } from 'nanoid'
import { usePresenter } from '@/composables/usePresenter'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { WebAppItem } from '@shared/presenter'

const { t } = useI18n()
const configPresenter = usePresenter('configPresenter')

// 网址应用列表
const webApps = ref<WebAppItem[]>([])

// 添加/编辑弹窗状态
const isAddWebAppDialog = ref(false)
const isEditing = ref(false)
const webAppForm = ref<WebAppItem>({
  id: '',
  name: '',
  url: '',
  icon: '',
  enabled: true
})
const urlError = ref(false)
const iconFileInput = ref<HTMLInputElement | null>(null)
const iconUrl = ref('')

// 删除弹窗状态
const isDeleteDialogOpen = ref(false)
const webAppToDelete = ref<WebAppItem | null>(null)

// 表单验证
const isValidForm = computed(() => {
  return (
    webAppForm.value.name.trim() !== '' &&
    webAppForm.value.url.trim() !== '' &&
    isValidUrl(webAppForm.value.url) &&
    webAppForm.value.icon !== '' // 确保有图标
  )
})

// 加载网址应用列表
const loadWebApps = async () => {
  try {
    const apps = await configPresenter.getWebApps()
    // 确保所有应用数据都是干净的原始类型
    if (apps && Array.isArray(apps)) {
      webApps.value = apps.map((app) => ({
        id: String(app.id || ''),
        name: String(app.name || ''),
        url: String(app.url || ''),
        icon: String(app.icon || ''),
        enabled: Boolean(app.enabled)
      }))
    } else {
      webApps.value = []
    }
  } catch (error) {
    console.error('加载网址应用失败:', error)
    webApps.value = []
  }
}

// 打开添加网址应用弹窗
const openAddWebAppDialog = () => {
  isEditing.value = false
  webAppForm.value = {
    id: nanoid(),
    name: '',
    url: '',
    icon: '',
    enabled: true
  }
  iconUrl.value = ''
  urlError.value = false
  isAddWebAppDialog.value = true
}

// 关闭添加网址应用弹窗
const closeAddWebAppDialog = () => {
  isAddWebAppDialog.value = false
}

// 编辑网址应用
const editWebApp = (app: WebAppItem) => {
  isEditing.value = true
  webAppForm.value = { ...app }
  iconUrl.value = app.icon
  urlError.value = false
  isAddWebAppDialog.value = true
}

// 保存网址应用
const saveWebApp = async () => {
  if (!isValidForm.value) {
    if (!isValidUrl(webAppForm.value.url)) {
      urlError.value = true
    }
    return
  }

  try {
    // 确保URL格式正确
    if (
      !webAppForm.value.url.startsWith('http://') &&
      !webAppForm.value.url.startsWith('https://')
    ) {
      webAppForm.value.url = 'https://' + webAppForm.value.url
    }

    // 创建一个新的简化对象 - 只包含必要的字符串和布尔值
    const appToSave = {
      id: String(webAppForm.value.id),
      name: String(webAppForm.value.name).trim(),
      url: String(webAppForm.value.url).trim(),
      icon: String(webAppForm.value.icon),
      enabled: Boolean(webAppForm.value.enabled)
    }

    let updatedApps: WebAppItem[]

    if (isEditing.value) {
      // 更新现有应用 - 使用纯字符串/布尔值创建新数组
      updatedApps = webApps.value.map((app) => {
        if (app.id === appToSave.id) {
          return { ...appToSave }
        }
        return {
          id: String(app.id),
          name: String(app.name),
          url: String(app.url),
          icon: String(app.icon),
          enabled: Boolean(app.enabled)
        }
      })
    } else {
      // 添加新应用 - 使用纯字符串/布尔值创建新数组
      updatedApps = webApps.value.map((app) => ({
        id: String(app.id),
        name: String(app.name),
        url: String(app.url),
        icon: String(app.icon),
        enabled: Boolean(app.enabled)
      }))
      updatedApps.push(appToSave)
    }

    // 使用JSON序列化和反序列化来确保对象可以被克隆
    const cleanApps = JSON.parse(JSON.stringify(updatedApps))
    await configPresenter.setWebApps(cleanApps)
    webApps.value = cleanApps
    closeAddWebAppDialog()
  } catch (error) {
    console.error('保存网址应用失败:', error)
    // 显示错误提示
    alert(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 切换网址应用启用状态
const toggleWebApp = async (app: WebAppItem) => {
  try {
    // 创建一个新的简化对象，确保所有属性都是原始类型
    const updatedApp = {
      id: String(app.id),
      name: String(app.name),
      url: String(app.url),
      icon: String(app.icon),
      enabled: !app.enabled // 切换状态
    }

    // 创建一个新的数组，确保所有对象都是可序列化的
    const updatedApps = webApps.value.map((a) => {
      if (a.id === app.id) {
        return updatedApp
      }
      return {
        id: String(a.id),
        name: String(a.name),
        url: String(a.url),
        icon: String(a.icon),
        enabled: Boolean(a.enabled)
      }
    })

    // 使用JSON序列化和反序列化来确保对象可以被克隆
    const cleanApps = JSON.parse(JSON.stringify(updatedApps))
    await configPresenter.setWebApps(cleanApps)
    webApps.value = cleanApps
  } catch (error) {
    console.error('切换网址应用状态失败:', error)
  }
}

// 确认删除网址应用
const confirmDeleteWebApp = (app: WebAppItem) => {
  webAppToDelete.value = app
  isDeleteDialogOpen.value = true
}

// 删除网址应用
const deleteWebApp = async () => {
  if (!webAppToDelete.value) return

  try {
    // 过滤掉要删除的应用，并确保所有对象都是可序列化的
    const updatedApps = webApps.value
      .filter((app) => app.id !== webAppToDelete.value?.id)
      .map((app) => ({
        id: String(app.id),
        name: String(app.name),
        url: String(app.url),
        icon: String(app.icon),
        enabled: Boolean(app.enabled)
      }))

    // 使用JSON序列化和反序列化来确保对象可以被克隆
    const cleanApps = JSON.parse(JSON.stringify(updatedApps))
    await configPresenter.setWebApps(cleanApps)
    webApps.value = cleanApps
    isDeleteDialogOpen.value = false
    webAppToDelete.value = null
  } catch (error) {
    console.error('删除网址应用失败:', error)
  }
}

// 触发图标上传
const triggerIconUpload = () => {
  iconFileInput.value?.click()
}

// 处理图标上传
const handleIconUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return

  try {
    // 读取上传的图片文件并转换为Data URL
    const file = input.files[0]

    // 限制文件大小，避免过大的图片导致问题
    if (file.size > 1024 * 1024) {
      // 限制为1MB
      throw new Error('图片大小不能超过1MB')
    }

    // 读取文件为Data URL
    const dataUrl = await readFileAsDataURL(file)

    // 压缩图片 - 使用PNG格式保留透明度
    const compressedDataUrl = await compressImage(dataUrl, 128, 128, 0.9, 'image/png')

    // 设置图标
    webAppForm.value.icon = compressedDataUrl
    iconUrl.value = compressedDataUrl
  } catch (error) {
    console.error('处理图标失败:', error)
    // 使用内联SVG作为默认图标
    const defaultIcon =
      'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%2224%22 height%3D%2224%22 viewBox%3D%220 0 24 24%22 fill%3D%22none%22 stroke%3D%22%23888%22 stroke-width%3D%222%22 stroke-linecap%3D%22round%22 stroke-linejoin%3D%22round%22%3E%3Ccircle cx%3D%2212%22 cy%3D%2212%22 r%3D%2210%22%2F%3E%3Cpath d%3D%22M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z%22%2F%3E%3Cline x1%3D%222%22 y1%3D%2212%22 x2%3D%2222%22 y2%3D%2212%22%2F%3E%3C%2Fsvg%3E'
    webAppForm.value.icon = defaultIcon
    iconUrl.value = defaultIcon
    alert(error instanceof Error ? error.message : '图片处理失败')
  }

  // 重置文件输入
  if (input) input.value = ''
}

// 处理预览图标加载错误
const handlePreviewIconError = () => {
  // 清空图标
  webAppForm.value.icon = ''
  iconUrl.value = ''
}

// 处理图标加载错误
const handleIconError = (event: Event, app: WebAppItem) => {
  const target = event.target as HTMLImageElement
  // 替换为简单的文字图标
  const letter = app.name.charAt(0).toUpperCase() || '?'
  const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${randomColor}" rx="15" />
    <text x="50" y="65" font-family="Arial" font-size="50" fill="white" text-anchor="middle">
      ${letter}
    </text>
  </svg>`

  target.src = `data:image/svg+xml;base64,${btoa(svg)}`
}

// 将文件读取为 Data URL
const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// URL验证
const isValidUrl = (url: string) => {
  if (!url) return false

  // 如果没有协议，添加https://
  let testUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    testUrl = 'https://' + url
  }

  try {
    new URL(testUrl)
    return true
  } catch (e) {
    return false
  }
}

// 压缩图片 - 修改为支持透明度
const compressImage = (
  dataUrl: string,
  maxWidth = 128,
  maxHeight = 128,
  quality = 0.8,
  format = 'image/png' // 默认使用PNG以支持透明度
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // 计算新尺寸
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height)
        height = maxHeight
      }

      // 创建canvas并绘制压缩后的图片
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'))
        return
      }

      // 清除画布以确保透明度正确
      ctx.clearRect(0, 0, width, height)

      // 绘制图像
      ctx.drawImage(img, 0, 0, width, height)

      // 转换为Data URL - 使用PNG格式保留透明度
      const compressedDataUrl = canvas.toDataURL(format, quality)
      resolve(compressedDataUrl)
    }

    img.onerror = () => {
      reject(new Error('压缩图片时出错'))
    }

    img.src = dataUrl
  })
}

onMounted(() => {
  loadWebApps()
})
</script>
