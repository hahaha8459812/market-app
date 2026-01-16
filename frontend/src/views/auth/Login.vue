<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useWsStore } from '../../stores/ws';

const router = useRouter();
const authStore = useAuthStore();
const wsStore = useWsStore();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const handleLogin = async () => {
  loading.value = true;
  const success = await authStore.login(form);
  loading.value = false;
  if (success) {
    wsStore.connect();
    router.push('/');
  }
};
</script>

<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>登录</span>
      </div>
    </template>
    <el-alert
      title="超级管理员账号来自 config.toml；普通用户可注册（若服务器允许）"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />
    <el-form :model="form" label-width="80px" @submit.prevent="handleLogin">
      <el-form-item label="用户名">
        <el-input v-model="form.username" placeholder="admin" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" placeholder="至少6位" show-password />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="handleLogin" style="width: 100%">登录</el-button>
      </el-form-item>
    </el-form>
    <div class="actions">
      <router-link to="/auth/register">没有账号？去注册</router-link>
    </div>
  </el-card>
</template>

<style scoped>
.actions {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
}
.actions a {
  color: #409eff;
  text-decoration: none;
}
</style>
