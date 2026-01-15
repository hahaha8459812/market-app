<script setup>
import { reactive, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import * as authApi from '../api/auth';
import { ElMessage } from 'element-plus';

const authStore = useAuthStore();

const form = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
});

onMounted(() => {
  form.username = authStore.user?.username || '';
});

const handleUpdateUsername = async () => {
  await authStore.updateUsername(form.username);
};

const handleUpdatePassword = async () => {
  try {
    await authApi.updatePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    ElMessage.success('密码已更新');
    form.currentPassword = '';
    form.newPassword = '';
  } catch (err) {
    // handled
  }
};
</script>

<template>
  <div class="profile-view">
    <el-card class="profile-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>用户管理</span>
        </div>
      </template>
      
      <div class="section">
        <h3>基本信息</h3>
        <el-form label-width="100px" class="profile-form">
          <el-form-item label="用户名">
            <el-input v-model="form.username" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleUpdateUsername">保存用户名</el-button>
          </el-form-item>
        </el-form>
      </div>

      <el-divider />

      <div class="section">
        <h3>安全设置</h3>
        <el-form label-width="100px" class="profile-form">
          <el-form-item label="当前密码">
            <el-input v-model="form.currentPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="form.newPassword" type="password" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleUpdatePassword">修改密码</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.profile-view {
  padding: 40px;
  display: flex;
  justify-content: center;
}
.profile-card {
  width: 100%;
  max-width: 600px;
}
.profile-form {
  max-width: 400px;
}
.section h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 16px;
  color: #303133;
}
</style>
