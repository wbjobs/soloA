<template>
  <div id="app">
    <el-container>
      <el-header class="header">
        <div class="logo">
          <el-icon size="28"><DataAnalysis /></el-icon>
          <span class="title">股票因子回测系统</span>
        </div>
        <el-menu
          :default-active="activeTab"
          mode="horizontal"
          class="nav-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="single">
            <el-icon><Coin /></el-icon>
            <span>单股票回测</span>
          </el-menu-item>
          <el-menu-item index="portfolio">
            <el-icon><Grid /></el-icon>
            <span>组合回测</span>
          </el-menu-item>
        </el-menu>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const activeTab = computed(() => {
  return route.path === '/portfolio' ? 'portfolio' : 'single'
})

const handleMenuSelect = (index) => {
  router.push(index === 'single' ? '/single' : '/portfolio')
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

#app {
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  color: white;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
}

.nav-menu {
  background: transparent;
  border-bottom: none;
}

.nav-menu .el-menu-item {
  color: rgba(255, 255, 255, 0.8);
  border-bottom: none !important;
}

.nav-menu .el-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-menu .el-menu-item.is-active {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border-bottom: none !important;
}

.el-main {
  background: #f0f2f5;
  min-height: calc(100vh - 60px);
}
</style>
