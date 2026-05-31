import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: '概览看板' }
  },
  {
    path: '/user',
    name: 'UserAnalysis',
    component: () => import('@/views/UserAnalysis.vue'),
    meta: { title: '用户分析' }
  },
  {
    path: '/product',
    name: 'ProductAnalysis',
    component: () => import('@/views/ProductAnalysis.vue'),
    meta: { title: '商品分析' }
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/views/Reports.vue'),
    meta: { title: '报表管理' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
