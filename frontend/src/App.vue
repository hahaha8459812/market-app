<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import { useWsStore } from './stores/ws';

const authStore = useAuthStore();
const wsStore = useWsStore();

onMounted(async () => {
  // Try to restore session
  await authStore.fetchMe();
  
  if (authStore.isAuthenticated) {
    wsStore.connect();
  }
});
</script>

<template>
  <router-view></router-view>
</template>

<style>
body {
  margin: 0;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
