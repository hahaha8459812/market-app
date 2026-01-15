import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/stats'
    },
    {
      path: '/auth',
      component: () => import('../layouts/AuthLayout.vue'),
      children: [
        { path: 'login', component: () => import('../views/auth/Login.vue') },
        { path: 'register', component: () => import('../views/auth/Register.vue') }
      ]
    },
    {
      path: '/',
      component: () => import('../layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: 'stats', component: () => import('../views/StatsView.vue') },
        { 
          path: 'customer', 
          component: () => import('../views/CustomerView.vue'),
          children: [
            { path: ':shopId', component: () => import('../views/shop/CustomerContent.vue') }
          ]
        },
        { 
          path: 'manager', 
          component: () => import('../views/ManagerView.vue'),
          children: [
            { path: ':shopId', component: () => import('../views/shop/ManagerContent.vue') }
          ]
        },
        { path: 'profile', component: () => import('../views/ProfileView.vue') },
        { path: 'admin', component: () => import('../views/AdminView.vue'), meta: { requiresAdmin: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  // Ensure we load user info when token exists (e.g. page refresh)
  if (!to.path.startsWith('/auth') && authStore.token && !authStore.user) {
    await authStore.fetchMe();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/auth/login');
  } else if (authStore.isSuperAdmin && !to.path.startsWith('/admin') && !to.path.startsWith('/auth')) {
    // 超级管理员仅允许进入管理面板
    next('/admin');
  } else if (to.meta.requiresAdmin && !authStore.isSuperAdmin) {
    next('/');
  } else {
    next();
  }
});

export default router;
