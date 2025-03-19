<template>
  <div class="flex h-full">
    <!-- 设置侧边栏 -->
    <div class="w-48 border-r p-4">
      <nav class="space-y-2">
        <router-link
          v-for="item in settingsItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="flex items-center px-3 py-2 rounded-md text-sm"
          :class="{
            'bg-primary text-primary-foreground': $route.name === item.name,
            'hover:bg-accent hover:text-accent-foreground': $route.name !== item.name
          }"
        >
          <Icon v-if="item.icon" :icon="item.icon" class="mr-2 h-4 w-4" />
          {{ t(item.titleKey) }}
        </router-link>
      </nav>
    </div>
    <!-- 设置内容 -->
    <div class="flex-1 overflow-auto">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'

const { t } = useI18n()

// 手动定义设置项，确保与路由配置一致
const settingsItems = ref([
  {
    name: 'settings-webapps',
    icon: 'lucide:globe',
    titleKey: 'routes.settings-webapps'
  },
  {
    name: 'settings-common',
    icon: 'lucide:bolt',
    titleKey: 'routes.settings-common'
  },
  {
    name: 'settings-provider',
    icon: 'lucide:cloud-cog',
    titleKey: 'routes.settings-provider'
  },
  {
    name: 'settings-database',
    icon: 'lucide:database',
    titleKey: 'routes.settings-database'
  },
  {
    name: 'settings-about',
    icon: 'lucide:info',
    titleKey: 'routes.settings-about'
  }
])
</script>

<style></style>
