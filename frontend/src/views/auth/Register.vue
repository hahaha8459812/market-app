<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const handleRegister = async () => {
  loading.value = true;
  const success = await authStore.register(form);
  loading.value = false;
  if (success) {
    router.push('/');
  }
};
</script>

<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>注册</span>
      </div>
    </template>
    <el-form :model="form" label-width="80px" @submit.prevent="handleRegister">
      <el-form-item label="用户名">
        <el-input v-model="form.username" placeholder="player1" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" placeholder="至少6位" show-password />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="handleRegister" style="width: 100%">注册</el-button>
      </el-form-item>
    </el-form>
    <div class="actions">
      <router-link to="/auth/login">已有账号？去登录</router-link>
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
