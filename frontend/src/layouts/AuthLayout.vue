<template>
  <div class="auth-page">
    <div class="hero">
      <h1>集市 Market</h1>
      <p>单容器部署版 · 配置文件超管登录</p>
    </div>
    <div class="auth-card">
      <router-view></router-view>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.hero {
  text-align: center;
}

.hero h1 {
  margin: 0;
  font-size: 32px;
  color: #303133;
}

.hero p {
  margin: 8px 0 0;
  color: #909399;
}

.auth-card {
  width: 100%;
  max-width: 480px;
}

@media (max-width: 768px) {
  .auth-page {
    padding: 24px 16px;
    gap: 24px;
  }

  .hero h1 {
    font-size: 24px;
  }

  .hero p {
    font-size: 14px;
  }
}
</style>
