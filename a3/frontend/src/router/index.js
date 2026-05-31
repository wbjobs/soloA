import { createRouter, createWebHistory } from 'vue-router'
import Backtest from '../views/Backtest.vue'
import PortfolioBacktest from '../views/PortfolioBacktest.vue'

const routes = [
  {
    path: '/',
    redirect: '/single'
  },
  {
    path: '/single',
    name: 'Backtest',
    component: Backtest
  },
  {
    path: '/portfolio',
    name: 'PortfolioBacktest',
    component: PortfolioBacktest
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
