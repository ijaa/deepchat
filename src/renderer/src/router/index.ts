import { createRouter, createWebHashHistory } from 'vue-router'
import ChatTabView from '@/views/ChatTabView.vue'
import SettingsTabView from '@/views/SettingsTabView.vue'
import WelcomeView from '@/views/WelcomeView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatTabView,
      meta: {
        titleKey: 'routes.chat',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: WelcomeView,
      meta: {
        titleKey: 'routes.welcome',
        icon: 'lucide:message-square'
      }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsTabView,
      meta: {
        titleKey: 'routes.settings',
        icon: 'lucide:settings'
      },
      children: [
        {
          path: 'webapps',
          name: 'settings-webapps',
          component: () => import('@/components/settings/WebAppSettings.vue'),
          meta: {
            titleKey: 'routes.settings-webapps',
            icon: 'lucide:globe'
          }
        },
        {
          path: 'common',
          name: 'settings-common',
          component: () => import('@/components/settings/CommonSettings.vue'),
          meta: {
            titleKey: 'routes.settings-common',
            icon: 'lucide:bolt'
          }
        },
        {
          path: 'provider/:providerId?',
          name: 'settings-provider',
          component: () => import('@/components/settings/ModelProviderSettings.vue'),
          meta: {
            titleKey: 'routes.settings-provider',
            icon: 'lucide:cloud-cog'
          }
        },
        {
          path: 'database',
          name: 'settings-database',
          component: () => import('@/components/settings/DataSettings.vue'),
          meta: {
            titleKey: 'routes.settings-database',
            icon: 'lucide:database'
          }
        },
        {
          path: 'about',
          name: 'settings-about',
          component: () => import('@/components/settings/AboutUsSettings.vue'),
          meta: {
            titleKey: 'routes.settings-about',
            icon: 'lucide:info'
          }
        }
      ]
    },
    {
      path: '/webapp/:id',
      name: 'webapp',
      component: () => import('@/views/WebAppView.vue'),
      meta: {
        titleKey: 'routes.webapp',
        icon: 'lucide:globe'
      }
    }
  ]
})

export default router
