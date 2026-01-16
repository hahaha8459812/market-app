<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useShopStore } from '../../stores/shop';
import ManagerHome from '../../components/manager/ManagerHome.vue';
import ManagerStore from '../../components/manager/ManagerStore.vue';
import ManagerInventory from '../../components/manager/ManagerInventory.vue';
import ShopLogs from '../../components/ShopLogs.vue';

const route = useRoute();
const shopStore = useShopStore();
const activeTab = ref('home');

const load = () => {
  const id = route.params.shopId;
  if (id) shopStore.loadShop(id, true);
};

watch(() => route.params.shopId, load, { immediate: true });
</script>

<template>
  <div class="shop-content-wrapper" v-if="shopStore.currentShop">
    <el-tabs v-model="activeTab" tab-position="right" class="content-tabs">
      <el-tab-pane label="小店主页" name="home">
        <div class="pane-content">
          <ManagerHome :shop="shopStore.currentShop" :members="shopStore.members" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="商店页面" name="store">
        <div class="pane-content">
          <ManagerStore :shop="shopStore.currentShop" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="钱包/背包" name="wallet">
        <div class="pane-content">
          <ManagerInventory :shop="shopStore.currentShop" :members="shopStore.members" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="操作日志" name="logs">
        <div class="pane-content">
          <ShopLogs :shop="shopStore.currentShop" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
  <div v-else class="loading-state" v-loading="shopStore.loading">
    加载中...
  </div>
</template>

<style scoped lang="scss">
.shop-content-wrapper {
  height: 100%;
  background: #fff;
  display: flex;
}

.content-tabs {
  width: 100%;
  height: 100%;
  
  :deep(.el-tabs__content) {
    height: 100%;
    overflow-y: auto;
    background-color: #f5f7fa;
  }

  :deep(.el-tabs__nav-wrap) {
    padding-top: 20px;
    background: #fff;
    width: 120px;
  }
}

.pane-content {
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.loading-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
</style>
