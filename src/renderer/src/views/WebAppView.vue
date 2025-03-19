<template>
  <div class="h-full w-full flex flex-col">
    <div ref="containerRef" class="flex-1 relative">
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center bg-background/50"
      >
        <div
          class="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const containerRef = ref<HTMLDivElement | null>(null)
const url = ref('')
const currentUrl = ref('')
const isLoading = ref(false)
const canGoBack = ref(false)
const canGoForward = ref(false)
const viewId = ref<number | null>(null)

// 初始化URL和BrowserView
onMounted(() => {
  const appId = route.params.id as string
  const appUrl = route.query.url as string

  if (appUrl) {
    url.value = appUrl
    currentUrl.value = appUrl

    // 创建BrowserView
    createWebView(appUrl)
  } else {
    // 如果没有URL参数，返回到聊天页面
    router.push({ name: 'chat' })
  }
})

// 在组件销毁前清理BrowserView
onBeforeUnmount(() => {
  if (viewId.value !== null) {
    window.electronAPI.ipcRenderer.send('destroy-web-view', viewId.value)
  }
})

// 监听路由参数变化
watch(
  () => route.query.url,
  (newUrl) => {
    if (newUrl && typeof newUrl === 'string') {
      url.value = newUrl
      currentUrl.value = newUrl

      // 如果已经创建了视图，则导航到新URL
      if (viewId.value !== null) {
        window.electronAPI.ipcRenderer.send('navigate-web-view', viewId.value, newUrl)
      } else {
        createWebView(newUrl)
      }
    }
  }
)

// 创建WebView
const createWebView = (url: string) => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()

    window.electronAPI.ipcRenderer.send('create-web-view', {
      url,
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    })

    isLoading.value = true
  }
}

// 监听窗口大小变化，调整BrowserView大小
const resizeObserver = new ResizeObserver(() => {
  if (containerRef.value && viewId.value !== null) {
    const rect = containerRef.value.getBoundingClientRect()
    window.electronAPI.ipcRenderer.send('resize-web-view', viewId.value, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  }
})

// 设置IPC监听器
onMounted(() => {
  // 监听WebView创建成功
  window.electronAPI.ipcRenderer.on('web-view-created', (_event, id) => {
    viewId.value = id

    // 开始监听容器大小变化
    if (containerRef.value) {
      resizeObserver.observe(containerRef.value)
    }
  })

  // 监听加载状态
  window.electronAPI.ipcRenderer.on('web-view-loading', (_event, id, loading) => {
    if (id === viewId.value) {
      isLoading.value = loading
    }
  })

  // 监听URL变化
  window.electronAPI.ipcRenderer.on('web-view-url-changed', (_event, id, newUrl) => {
    if (id === viewId.value) {
      currentUrl.value = newUrl
    }
  })

  // 监听导航状态
  window.electronAPI.ipcRenderer.on('web-view-navigation-state', (_event, id, state) => {
    if (id === viewId.value) {
      canGoBack.value = state.canGoBack
      canGoForward.value = state.canGoForward
    }
  })
})

// 清理监听器
onBeforeUnmount(() => {
  if (containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
  }
  resizeObserver.disconnect()
})
</script>
