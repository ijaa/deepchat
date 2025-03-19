<template>
  <div class="flex p-2 flex-col items-center border-r bg-background">
    <!-- Navigation Items -->
    <nav class="flex flex-1 flex-col gap-2">
      <!-- Chat Section -->
      <Button
        variant="ghost"
        size="icon"
        class="rounded-lg w-9 h-9"
        :class="{ 'bg-accent': modelValue === 'chat' }"
        @click="$emit('update:modelValue', 'chat')"
      >
        <Icon
          icon="lucide:message-circle"
          :class="['h-5 w-5', modelValue === 'chat' ? ' text-primary' : 'text-muted-foreground']"
        />
        <span class="sr-only">Chat</span>
      </Button>

      <!-- 网址应用导航项 - 移到这里，在聊天下方，关于上方 -->
      <div v-if="enabledWebApps.length > 0" class="mt-2 pt-2 border-t border-border">
        <button
          v-for="app in enabledWebApps"
          :key="app.id"
          class="flex items-center justify-center w-9 h-9 rounded-lg mx-auto mb-1 hover:bg-accent hover:text-accent-foreground"
          @click="openWebApp(app)"
        >
          <img
            v-if="app.icon && (app.icon.startsWith('data:') || app.icon.startsWith('http'))"
            :src="app.icon"
            :alt="app.name"
            class="w-5 h-5 rounded object-contain"
            @error="handleIconError($event, app)"
          />
          <div
            v-else
            class="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-xs"
            :style="{ backgroundColor: app.icon || '#4f46e5' }"
          >
            {{ app.name.charAt(0).toUpperCase() }}
          </div>
        </button>
      </div>
    </nav>
    <!-- User Profile Section -->
    <div class="mt-auto relative flex flex-col items-center">
      <!-- Settings Section -->
      <Button
        variant="ghost"
        size="icon"
        class="rounded-lg w-9 h-9"
        :class="{ 'bg-accent': modelValue === 'settings' }"
        @click="$emit('update:modelValue', 'settings')"
      >
        <Icon
          icon="lucide:bolt"
          :class="[
            'h-5 w-5',
            modelValue === 'settings' ? ' text-primary' : 'text-muted-foreground'
          ]"
        />
        <span class="sr-only">Settings</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="w-9 h-9 rounded-lg text-muted-foreground"
        @click="toggleDark()"
      >
        <Icon :icon="isDark ? 'lucide:sun' : 'lucide:moon'" class="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="rounded-lg w-9 h-9 text-muted-foreground relative"
        @click="handleProfileClick"
      >
        <Icon icon="lucide:user" class="h-5 w-5" />
        <span
          v-if="settings.hasUpdate"
          class="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"
        ></span>
        <span class="sr-only">User Profile</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { onMounted, watch, ref, computed } from 'vue'
import { useDark, useToggle } from '@vueuse/core'
import { usePresenter } from '@/composables/usePresenter'
import type { WebAppItem } from '@shared/presenter'
import { CONFIG_EVENTS } from '@/events'
import { useRouter } from 'vue-router'

defineProps<{
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

const settings = useSettingsStore()
const isDark = useDark()
const toggleDark = useToggle(isDark)

const configPresenter = usePresenter('configPresenter')
const webApps = ref<WebAppItem[]>([])
const router = useRouter()

// 获取已启用的网址应用
const enabledWebApps = computed(() => {
  const enabled = webApps.value.filter((app) => app.enabled)
  console.log('Enabled web apps:', enabled)
  return enabled
})

const handleProfileClick = async () => {
  if (!settings.hasUpdate) {
    await settings.checkUpdate()
  } else {
    settings.openUpdateDialog()
  }
}

// 监听更新状态变化，当有新更新时自动显示更新弹窗
watch(
  () => settings.hasUpdate,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      settings.openUpdateDialog()
    }
  }
)

// 加载网址应用
const loadWebApps = async () => {
  try {
    const apps = await configPresenter.getWebApps()
    webApps.value = apps || []
  } catch (error) {
    console.error('加载网址应用失败:', error)
    webApps.value = []
  }
}

// 打开网址应用
const openWebApp = (app: WebAppItem) => {
  try {
    // 使用路由导航到网址应用视图
    router.push({
      name: 'webapp',
      params: { id: app.id },
      query: { url: app.url, name: app.name }
    })
  } catch (error) {
    console.error('打开网址应用失败:', error)
  }
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

// 确保 CONFIG_EVENTS 包含 WEB_APPS_UPDATED
// 如果 CONFIG_EVENTS 中没有 WEB_APPS_UPDATED，可以使用自定义事件名
const WEB_APPS_EVENT = 'web-apps-updated'

window.electronAPI.ipcRenderer.on(
  WEB_APPS_EVENT, // 使用自定义事件名
  (_event, updatedApps) => {
    if (Array.isArray(updatedApps)) {
      webApps.value = updatedApps
    }
  }
)

onMounted(() => {
  console.log('SideBar mounted, loading web apps')
  settings.checkUpdate()
  loadWebApps()
})
</script>
