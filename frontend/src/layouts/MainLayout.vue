<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useWsStore } from '../stores/ws';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const wsStore = useWsStore();

const activeTab = computed({
  get: () => {
    if (authStore.isSuperAdmin) return 'admin';
    if (route.path.startsWith('/stats')) return 'stats';
    if (route.path.startsWith('/customer')) return 'customer';
    if (route.path.startsWith('/manager')) return 'manager';
    if (route.path.startsWith('/profile')) return 'profile';
    if (route.path.startsWith('/admin')) return 'admin';
    return 'stats';
  },
  set: (val) => {
    if (authStore.isSuperAdmin) {
      router.push('/admin');
      return;
    }
    router.push(`/${val}`);
  }
});

const handleLogout = () => {
  authStore.clearAuth();
  wsStore.close();
  router.push('/auth/login');
};
</script>

<template>
  <div class="main-layout">
    <header class="navbar">
      <div class="nav-left">
        <div class="brand">集市 Market</div>
      </div>
      
      <div class="nav-center">
        <el-tabs v-model="activeTab" class="nav-tabs">
          <el-tab-pane v-if="!authStore.isSuperAdmin" label="统计" name="stats" />
          <el-tab-pane v-if="!authStore.isSuperAdmin" label="顾客" name="customer" />
          <el-tab-pane v-if="!authStore.isSuperAdmin" label="店长" name="manager" />
          <el-tab-pane v-if="!authStore.isSuperAdmin" label="用户管理" name="profile" />
          <el-tab-pane v-if="authStore.isSuperAdmin" label="超级管理员" name="admin" />
        </el-tabs>
      </div>

      <div class="nav-right">
        <span class="user-info">
          <strong>{{ authStore.user?.username }}</strong>
          <span class="status-dot" :class="wsStore.status" :title="`WS: ${wsStore.status}`"></span>
        </span>
        <el-button type="danger" text @click="handleLogout">退出</el-button>
      </div>
    </header>

    <main class="main-content">
      <router-view></router-view>
    </main>
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  min-height: 100vh;
  background-color: #f5f7fa;
  display: flex;
  flex-direction: column;
}

.navbar {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  z-index: 100;
}

.brand {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}

.nav-center {
  flex: 1;
  display: flex;
  justify-content: center;
  
  :deep(.el-tabs__header) {
    margin: 0;
  }
  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }
  :deep(.el-tabs__item) {
    font-size: 16px;
    height: 60px;
    line-height: 60px;
  }
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #909399;
  
  &.connected { background-color: #67c23a; }
  &.error { background-color: #f56c6c; }
}

.main-content {
  flex: 1;
  height: calc(100vh - 60px);
  overflow: hidden; 
}
</style>
