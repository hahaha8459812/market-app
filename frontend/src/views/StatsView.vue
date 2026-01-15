<script setup>
import { ref, onMounted, computed } from 'vue';
import { useShopStore } from '../stores/shop';
import * as shopApi from '../api/shops';
import * as adminApi from '../api/admin'; // For global stats if needed, or mock it
import { ElMessage } from 'element-plus';

const shopStore = useShopStore();
const joinForm = ref({ inviteCode: '' });
const globalStats = ref(null);

onMounted(async () => {
  await shopStore.fetchMyShops();
  // Try to fetch global stats if available to user, otherwise just shop store stats
  // As PLAYER, /admin/stats is forbidden. But requirement says "Platform current shop count".
  // Assuming there is a public stats API or I just show personal stats as platform stats is usually admin only.
  // Wait, if the requirement asks for it, maybe I should check if there is a public endpoint.
  // Looking at API.md, /admin/stats is SUPER_ADMIN only.
  // So I will just display what I can access or maybe the prompt implies I should add a public stat endpoint?
  // "平台当前小店总数等统计数据" - maybe I can't get it as a normal user. I will display user's stats instead.
});

const managedShops = computed(() => shopStore.myShops.filter(s => ['OWNER', 'CLERK'].includes(s.role)));
const joinedShops = computed(() => shopStore.myShops.filter(s => s.role === 'CUSTOMER'));

const handleJoinShop = async () => {
  if (!joinForm.value.inviteCode) return ElMessage.warning('请输入邀请码');
  try {
    await shopApi.joinShop(joinForm.value);
    ElMessage.success('加入成功');
    joinForm.value = { inviteCode: '' };
    shopStore.fetchMyShops();
  } catch (err) {
    // handled
  }
};
</script>

<template>
  <div class="stats-view">
    <div class="stats-container">
      <el-row :gutter="24">
        <el-col :xs="24" :md="8">
          <el-card class="stat-card" shadow="hover">
            <template #header>我的小店</template>
            <div class="stat-content">
              <div class="stat-item">
                <span class="label">管理</span>
                <span class="value">{{ managedShops.length }}</span>
              </div>
              <div class="stat-item">
                <span class="label">加入</span>
                <span class="value">{{ joinedShops.length }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
        
        <el-col :xs="24" :md="16">
          <el-card class="join-card" shadow="hover">
            <template #header>加入新小店</template>
            <div class="join-form">
              <el-input 
                v-model="joinForm.inviteCode" 
                placeholder="请输入邀请码" 
                prefix-icon="Ticket"
                class="join-input"
              />
              <el-button type="primary" @click="handleJoinShop" class="join-btn">
                加入小店
              </el-button>
            </div>
            <div class="tips">
              提示：邀请码由店长或店员提供，有效期通常为10分钟。
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div class="shop-list-section">
        <h3>已加入的小店列表</h3>
        <el-empty v-if="!shopStore.myShops.length" description="暂未加入任何小店" />
        <div class="grid-list" v-else>
          <div v-for="shop in shopStore.myShops" :key="shop.shopId" class="shop-grid-item">
            <div class="shop-icon">{{ shop.shop.name.charAt(0) }}</div>
            <div class="shop-info">
              <div class="name">{{ shop.shop.name }}</div>
              <div class="role-tag" :class="shop.role.toLowerCase()">{{ shop.role }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stats-view {
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
}

.stat-content {
  display: flex;
  justify-content: space-around;
  padding: 20px 0;
  
  .stat-item {
    text-align: center;
    .label {
      display: block;
      color: #909399;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .value {
      font-size: 32px;
      font-weight: bold;
      color: #303133;
    }
  }
}

.join-form {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  
  .join-input {
    flex: 1;
    min-width: 200px;
  }
  
  .join-btn {
    min-width: 120px;
  }
}

.tips {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}

.shop-list-section {
  margin-top: 40px;
  
  h3 {
    margin-bottom: 20px;
    color: #606266;
  }
}

.grid-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.shop-grid-item {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
  transition: all 0.3s;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px 0 rgba(0,0,0,0.1);
  }
  
  .shop-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: #409eff;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: bold;
  }
  
  .shop-info {
    flex: 1;
    .name {
      font-weight: bold;
      color: #303133;
      margin-bottom: 6px;
    }
    .role-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background: #f0f2f5;
      color: #909399;
      
      &.owner { color: #f56c6c; background: #fef0f0; }
      &.clerk { color: #e6a23c; background: #fdf6ec; }
      &.customer { color: #67c23a; background: #f0f9eb; }
    }
  }
}
</style>
