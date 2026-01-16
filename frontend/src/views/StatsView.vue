<script setup>
import { ref, onMounted, computed } from 'vue';
import { useShopStore } from '../stores/shop';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import * as shopApi from '../api/shops';
import * as statsApi from '../api/stats';
import { ElMessage } from 'element-plus';

const shopStore = useShopStore();
const authStore = useAuthStore();
const router = useRouter();

const joinForm = ref({ inviteCode: '' });
const createDialog = ref(false);
const createForm = ref({ name: '' });

const platformStats = ref(null);
const statsLoading = ref(false);

const managedShops = computed(() => shopStore.myShops.filter((s) => ['OWNER', 'CLERK'].includes(s.role)));
const joinedShops = computed(() => shopStore.myShops.filter((s) => s.role === 'CUSTOMER'));

const tab = ref('all');
const filteredShops = computed(() => {
  if (tab.value === 'managed') return managedShops.value;
  if (tab.value === 'joined') return joinedShops.value;
  return shopStore.myShops;
});

const roleText = (role) => {
  if (role === 'OWNER') return '店长';
  if (role === 'CLERK') return '店员';
  if (role === 'CUSTOMER') return '顾客';
  return role || '';
};

const loadPlatformStats = async () => {
  statsLoading.value = true;
  try {
    const res = await statsApi.getPlatformStats();
    platformStats.value = res.data;
  } catch (err) {
    platformStats.value = null;
  } finally {
    statsLoading.value = false;
  }
};

onMounted(async () => {
  await Promise.all([shopStore.fetchMyShops(), loadPlatformStats()]);
});

const handleJoinShop = async () => {
  const code = String(joinForm.value.inviteCode || '').trim();
  if (!code) return ElMessage.warning('请输入邀请码');
  try {
    await shopApi.joinShop({ inviteCode: code });
    ElMessage.success('加入成功');
    joinForm.value = { inviteCode: '' };
    shopStore.fetchMyShops();
  } catch (err) {
    // handled
  }
};

const openCreateShop = () => {
  createForm.value = { name: '' };
  createDialog.value = true;
};

const handleCreateShop = async () => {
  const name = String(createForm.value.name || '').trim();
  if (!name) return ElMessage.warning('请输入小店名称');
  try {
    const res = await shopApi.createShop(name);
    ElMessage.success('小店已创建');
    createDialog.value = false;
    await shopStore.fetchMyShops();
    const shopId = res.data?.id;
    if (shopId) router.push(`/manager/${shopId}`);
  } catch (err) {
    // handled
  }
};

const openShop = (shop) => {
  const role = shop?.role;
  const shopId = shop?.shopId;
  if (!shopId) return;
  if (role === 'OWNER' || role === 'CLERK') return router.push(`/manager/${shopId}`);
  return router.push(`/customer/${shopId}`);
};
</script>

<template>
  <div class="stats-view">
    <div class="stats-container">
      <el-row :gutter="16" class="top-row">
        <el-col :xs="24" :md="8">
          <el-card class="stat-card" shadow="hover">
            <template #header>平台统计</template>
            <el-skeleton :loading="statsLoading" animated :rows="3">
              <div class="stat-grid" v-if="platformStats">
                <div class="stat-kv">
                  <div class="k">账号数</div>
                  <div class="v">{{ platformStats.users }}</div>
                </div>
                <div class="stat-kv">
                  <div class="k">小店数</div>
                  <div class="v">{{ platformStats.shops }}</div>
                </div>
                <div class="stat-kv">
                  <div class="k">活跃成员</div>
                  <div class="v">{{ platformStats.activeMembers }}</div>
                </div>
                <div class="stat-kv">
                  <div class="k">商品数</div>
                  <div class="v">{{ platformStats.products }}</div>
                </div>
              </div>
              <div class="empty-hint" v-else>暂无统计数据</div>
            </el-skeleton>
          </el-card>
        </el-col>

        <el-col :xs="24" :md="8">
          <el-card class="stat-card" shadow="hover">
            <template #header>我的小店</template>
            <div class="stat-grid">
              <div class="stat-kv">
                <div class="k">我管理的</div>
                <div class="v">{{ managedShops.length }}</div>
              </div>
              <div class="stat-kv">
                <div class="k">我加入的</div>
                <div class="v">{{ joinedShops.length }}</div>
              </div>
              <div class="stat-kv">
                <div class="k">总计</div>
                <div class="v">{{ shopStore.myShops.length }}</div>
              </div>
              <div class="stat-kv action-kv">
                <el-button v-if="!authStore.isSuperAdmin" type="primary" @click="openCreateShop">创建小店</el-button>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :md="8">
          <el-card class="join-card" shadow="hover">
            <template #header>加入新小店</template>
            <div class="join-form">
              <el-input
                v-model="joinForm.inviteCode"
                placeholder="请输入邀请码"
                prefix-icon="Ticket"
                class="join-input"
                @keyup.enter="handleJoinShop"
              />
              <el-button type="primary" @click="handleJoinShop" class="join-btn">加入</el-button>
            </div>
            <div class="tips">提示：邀请码由店长或店员提供，有效期通常为 10 分钟。</div>
          </el-card>
        </el-col>
      </el-row>

      <div class="shop-list-section">
        <div class="section-header">
          <h3>我的小店列表</h3>
          <el-tabs v-model="tab" class="tabs">
            <el-tab-pane label="全部" name="all" />
            <el-tab-pane label="我管理的" name="managed" />
            <el-tab-pane label="我加入的" name="joined" />
          </el-tabs>
        </div>

        <el-empty v-if="!filteredShops.length" description="暂无小店" />
        <div class="grid-list" v-else>
          <div v-for="shop in filteredShops" :key="shop.shopId" class="shop-grid-item" @click="openShop(shop)">
            <div class="shop-icon">{{ shop.shop.name.charAt(0) }}</div>
            <div class="shop-info">
              <div class="name">{{ shop.shop.name }}</div>
              <div class="meta">
                <div class="role-tag" :class="shop.role.toLowerCase()">{{ roleText(shop.role) }}</div>
                <div class="shop-id">ID {{ shop.shopId }}</div>
              </div>
            </div>
            <div class="shop-actions">
              <el-button size="small" type="primary" plain @click.stop="openShop(shop)">进入</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="createDialog" title="创建小店" width="420px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="小店名称">
          <el-input v-model="createForm.name" placeholder="例如：矮人铁匠铺" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateShop">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.stats-view {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.top-row :deep(.el-card) {
  height: 100%;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  padding: 8px 0 4px;
}

.stat-kv {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-kv .k {
  font-size: 12px;
  color: #909399;
}

.stat-kv .v {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: #303133;
}

.action-kv {
  background: transparent;
  border: none;
  padding: 0;
  align-items: flex-start;
  justify-content: flex-start;
}

.empty-hint {
  color: #909399;
  font-size: 14px;
  padding: 12px 0;
}

.join-form {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;

  .join-input {
    flex: 1;
    min-width: 200px;
  }

  .join-btn {
    min-width: 88px;
  }
}

.tips {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}

.shop-list-section {
  margin-top: 28px;
}

.section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  color: #606266;
}

.tabs {
  max-width: 420px;
}

.grid-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.shop-grid-item {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
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
    min-width: 0;

    .name {
      font-weight: bold;
      color: #303133;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .role-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background: #f0f2f5;
      color: #909399;

      &.owner {
        color: #f56c6c;
        background: #fef0f0;
      }
      &.clerk {
        color: #e6a23c;
        background: #fdf6ec;
      }
      &.customer {
        color: #67c23a;
        background: #f0f9eb;
      }
    }

    .shop-id {
      font-size: 12px;
      color: #909399;
    }
  }
}

.shop-actions {
  flex-shrink: 0;
}
</style>
