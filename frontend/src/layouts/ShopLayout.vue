<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps(['shops', 'basePath', 'title']);
const route = useRoute();
const router = useRouter();

const isCollapsed = ref(false);

const activeShopId = computed(() => route.params.shopId);

const handleSelect = (index) => {
  router.push(`${props.basePath}/${index}`);
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};
</script>

<template>
  <div class="shop-layout">
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="sidebar-header">
        <span v-if="!isCollapsed" class="title">{{ title }}</span>
        <el-button link @click="toggleCollapse">
          <el-icon><Menu /></el-icon>
        </el-button>
      </div>
      
      <el-menu 
        :default-active="activeShopId"
        class="shop-menu"
        :collapse="isCollapsed"
        @select="handleSelect"
      >
        <el-menu-item v-for="shop in shops" :key="shop.shopId" :index="String(shop.shopId)">
          <el-icon><Shop /></el-icon>
          <template #title>
            <span>{{ shop.shop.name }}</span>
          </template>
        </el-menu-item>
      </el-menu>
    </aside>

    <main class="content-area">
      <div v-if="!activeShopId" class="empty-state">
        <el-empty description="请选择左侧小店" />
      </div>
      <slot v-else></slot>
    </main>
  </div>
</template>

<style scoped lang="scss">
.shop-layout {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e6e6e6;
  transition: width 0.3s;
  display: flex;
  flex-direction: column;

  &.collapsed {
    width: 64px;
  }
}

.sidebar-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #f0f0f0;
  
  .title {
    font-weight: bold;
    color: #606266;
    white-space: nowrap;
  }
}

.shop-menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
}

.content-area {
  flex: 1;
  background: #f5f7fa;
  overflow-y: auto;
  position: relative;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
