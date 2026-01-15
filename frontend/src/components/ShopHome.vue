<script setup>
import { computed } from 'vue';
import { useShopStore } from '../stores/shop';
import { useAuthStore } from '../stores/auth';
import { useRouter } from 'vue-router';
import * as shopApi from '../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps(['shop']);
const shopStore = useShopStore();
const authStore = useAuthStore();
const router = useRouter();

const myMember = computed(() => props.shop.member);
const isManager = computed(() => ['OWNER', 'CLERK'].includes(myMember.value?.role));

const handleLeaveShop = async () => {
  try {
    await ElMessageBox.confirm('确认退出该小店？', '提示', { type: 'warning' });
    await shopApi.leaveShop(props.shop.shop.id);
    ElMessage.success('已退出');
    router.push('/');
  } catch (err) {
    // handled
  }
};
</script>

<template>
  <div class="shop-home">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ shop.shop.name }}</span>
          <el-button v-if="!isManager" type="danger" plain size="small" @click="handleLeaveShop">退出小店</el-button>
        </div>
      </template>
      
      <div class="info-row">
        <strong>我的身份：</strong>
        <el-tag>{{ myMember?.role }}</el-tag>
        <span class="char-name">（角色：{{ myMember?.charName }}）</span>
      </div>

      <h3>成员列表</h3>
      <el-table :data="shop.members" style="width: 100%" size="small">
        <el-table-column prop="charName" label="角色名" />
        <el-table-column prop="role" label="身份">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === 'OWNER' ? 'danger' : row.role === 'CLERK' ? 'warning' : 'info'">
              {{ row.role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isManager" prop="userId" label="用户ID" width="80" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.info-row {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.char-name {
  color: #606266;
}
</style>
