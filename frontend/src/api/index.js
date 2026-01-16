import axios from 'axios';
import { ElMessage } from 'element-plus';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('market_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const raw = error?.response?.data?.message ?? error?.message ?? '请求失败';
    const msg =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.filter(Boolean).join('；')
          : raw
            ? JSON.stringify(raw)
            : '请求失败';
    ElMessage.error(msg);
    if (error.response?.status === 401) {
      localStorage.removeItem('market_token');
      // Optional: redirect to login
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
