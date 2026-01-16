<script setup>
import { computed, ref } from 'vue';
import { ArrowLeft } from '@element-plus/icons-vue';
import ShopInventory from '../ShopInventory.vue';

const props = defineProps(['shop', 'members']);

const activeMemberId = ref(null);
const customers = computed(() => (props.members || []).filter((m) => m.role === 'CUSTOMER'));
const activeCustomer = computed(() => customers.value.find((c) => c.id === activeMemberId.value) || null);

const handleSelectMember = (row) => {
  activeMemberId.value = row.id;
};
</script>

<template>
  <div class="manager-inventory">
    <div v-if="!activeMemberId" class="member-list">
      <el-table :data="customers" style="width: 100%" @row-click="handleSelectMember" class="clickable-rows">
        <el-table-column prop="charName" label="顾客角色名" />
        <el-table-column prop="userId" label="用户ID" width="100" />
      </el-table>
      <div v-if="!customers.length" class="empty-text">暂无顾客</div>
    </div>

    <div v-else class="member-detail">
      <div class="detail-header">
        <el-button link :icon="ArrowLeft" @click="activeMemberId = null">返回列表</el-button>
        <div class="title">管理顾客：{{ activeCustomer?.charName || activeMemberId }}</div>
      </div>

      <ShopInventory
        :shop="props.shop"
        mode="manager"
        :member-id="activeMemberId"
        :member-name="activeCustomer?.charName || ''"
      />
    </div>
  </div>
</template>

<style scoped>
.clickable-rows {
  cursor: pointer;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.title {
  font-size: 16px;
  font-weight: 600;
}
.empty-text {
  color: #909399;
  padding: 16px 4px;
}
</style>

