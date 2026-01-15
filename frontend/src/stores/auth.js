import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '../api/auth';
import { ElMessage } from 'element-plus';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(localStorage.getItem('market_token') || '');

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isSuperAdmin = computed(() => user.value?.role === 'SUPER_ADMIN');

  const setAuth = (data) => {
    token.value = data.accessToken;
    user.value = data.user;
    localStorage.setItem('market_token', data.accessToken);
  };

  const clearAuth = () => {
    token.value = '';
    user.value = null;
    localStorage.removeItem('market_token');
  };

  const login = async (credentials) => {
    try {
      const res = await authApi.login(credentials);
      setAuth(res.data);
      ElMessage.success('登录成功');
      return true;
    } catch (err) {
      return false;
    }
  };

  const register = async (credentials) => {
    try {
      const res = await authApi.register(credentials);
      setAuth(res.data);
      ElMessage.success('注册成功');
      return true;
    } catch (err) {
      return false;
    }
  };

  const fetchMe = async () => {
    if (!token.value) return;
    try {
      const res = await authApi.getMe();
      user.value = res.data;
    } catch (err) {
      clearAuth();
    }
  };

  const updateUsername = async (username) => {
    try {
      const res = await authApi.updateUsername(username);
      user.value = res.data;
      ElMessage.success('用户名已更新');
    } catch (err) {
      // handled by interceptor
    }
  };

  return {
    user,
    token,
    isAuthenticated,
    isSuperAdmin,
    login,
    register,
    fetchMe,
    clearAuth,
    updateUsername
  };
});
