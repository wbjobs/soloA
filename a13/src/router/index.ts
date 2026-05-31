import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    redirect: '/forms',
  },
  {
    path: '/forms',
    name: 'FormList',
    component: () => import('@/views/FormList.vue'),
  },
  {
    path: '/editor/:id?',
    name: 'FormEditor',
    component: () => import('@/views/FormEditor.vue'),
  },
  {
    path: '/preview/:id',
    name: 'FormPreview',
    component: () => import('@/views/FormPreview.vue'),
  },
  {
    path: '/publish/:id',
    name: 'FormPublish',
    component: () => import('@/views/FormPublish.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
