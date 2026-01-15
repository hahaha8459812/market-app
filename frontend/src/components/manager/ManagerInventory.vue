<script setup>
import { reactive, ref, computed } from 'vue';
import { useShopStore } from '../../stores/shop';
import * as shopApi from '../../api/shops';
import { ElMessage } from 'element-plus';

const props = defineProps(['shop']);
const shopStore = useShopStore();

const activeMemberId = ref(null);
const memberInventory = ref([]);

const customers = computed(() => props.shop.members.filter(m => m.role === 'CUSTOMER'));

const handleSelectMember = async (id) => {
  activeMemberId.value = id;
  loadMemberInventory(id);
};

const loadMemberInventory = async (id) => {
  try {
    const res = await shopApi.getShopInventory(props.shop.shop.id, { memberId: id });
    memberInventory.value = res.data;
  } catch (err) {
    memberInventory.value = [];
  }
};

const backToList = () => {
  activeMemberId.value = null;
};

// Balance
const grantForm = reactive({ amount: 0, currencyId: null, sign: 1 });

const handleGrant = async () => {
  if (!grantForm.currencyId) return ElMessage.warning('请选择币种');
  const amount = Math.floor(Math.abs(grantForm.amount));
  if (amount === 0) return;
  
  // If team mode, target is 'team', else 'personal' with memberId
  const target = props.shop.shop.walletMode === 'TEAM' ? 'team' : 'personal';
  if (target === 'personal' && !activeMemberId.value) return;
  
  try {
    await shopApi.grantBalance(props.shop.shop.id, {
      memberId: target === 'personal' ? activeMemberId.value : undefined,
      currencyId: grantForm.currencyId,
      amount: amount * grantForm.sign,
      target
    });
    ElMessage.success('余额已更新');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

// Inventory Adjust
const invAdjust = reactive({ name: '', quantity: 1, icon: '', extraDesc: '' });

const handleInvAdjust = async (sign) => {
  if (!invAdjust.name) return ElMessage.warning('请输入物品名');
  const qty = Math.floor(Math.abs(invAdjust.quantity));
  if (qty === 0) return;
  
  try {
    await shopApi.adjustInventory(props.shop.shop.id, {
      memberId: activeMemberId.value,
      name: invAdjust.name,
      quantityDelta: qty * sign,
      icon: invAdjust.icon,
      extraDesc: invAdjust.extraDesc
    });
    ElMessage.success('背包已更新');
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // handled
  }
};

const getCurrencyName = (id) => {
  const c = props.shop.currencies?.find(x => x.id === id);
  return c ? c.name : 'Unknown';
};

const getBalance = (currencyId) => {
  const b = props.shop.balances.team?.find(x => x.currencyId === currencyId);
  return b ? b.amount : 0;
};
</script>

<template>
  <div class="manager-inventory">
    <div v-if="!activeMemberId" class="member-list">
      <el-table :data="customers" style="width: 100%" @row-click="row => handleSelectMember(row.id)" class="clickable-rows">
        <el-table-column prop="charName" label="顾客角色名" />
        <el-table-column prop="userId" label="用户ID" width="100" />
        <el-table-column label="操作" width="80">
          <template #default>
            <el-icon><ArrowRight /></el-icon>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-else class="member-detail">
      <div class="detail-header">
        <el-button link icon="ArrowLeft" @click="backToList">返回列表</el-button>
        <h3>管理顾客: {{ customers.find(c => c.id === activeMemberId)?.charName }}</h3>
      </div>

      <el-row :gutter="20">
        <el-col :xs="24" :md="10">
          <el-card shadow="never" class="mb-20">
            <template #header>余额管理 ({{ props.shop.shop.walletMode === 'TEAM' ? '全队共享' : '个人独立' }})</template>
            <div v-if="props.shop.shop.walletMode === 'TEAM'" class="balance-display">
              <div v-for="c in props.shop.currencies.filter(x => x.isActive)" :key="c.id">
                {{ c.name }}: <strong>{{ getBalance(c.id) }}</strong>
              </div>
            </div>
            <el-divider v-if="props.shop.shop.walletMode === 'TEAM'" />
            
            <el-form label-width="60px">
              <el-form-item label="币种">
                <el-select v-model="grantForm.currencyId">
                  <el-option v-for="c in props.shop.currencies.filter(x => x.isActive)" :key="c.id" :label="c.name" :value="c.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="金额">
                <el-input-number v-model="grantForm.amount" :min="0" style="width: 100%" />
              </el-form-item>
              <el-form-item>
                <el-button type="success" @click="() => { grantForm.sign = 1; handleGrant(); }">增加</el-button>
                <el-button type="danger" @click="() => { grantForm.sign = -1; handleGrant(); }">减少</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <el-card shadow="never">
            <template #header>物品增删</template>
            <el-form label-width="60px">
              <el-form-item label="物品"><el-input v-model="invAdjust.name" /></el-form-item>
              <el-form-item label="数量"><el-input-number v-model="invAdjust.quantity" :min="1" style="width: 100%" /></el-form-item>
              <el-form-item label="图标"><el-input v-model="invAdjust.icon" placeholder="Emoji" /></el-form-item>
              <el-form-item label="备注"><el-input v-model="invAdjust.extraDesc" /></el-form-item>
              <el-form-item>
                <el-button type="success" @click="handleInvAdjust(1)">增加</el-button>
                <el-button type="danger" @click="handleInvAdjust(-1)">减少</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :xs="24" :md="14">
          <el-card shadow="never">
            <template #header>顾客背包</template>
            <el-table :data="memberInventory" size="small" border>
              <el-table-column label="图标" width="60">
                <template #default="{ row }">{{ row.icon || '📦' }}</template>
              </el-table-column>
              <el-table-column prop="name" label="物品" />
              <el-table-column prop="quantity" label="数量" width="80" />
              <el-table-column prop="extraDesc" label="备注" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>
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
  gap: 10px;
  margin-bottom: 20px;
}
.mb-20 {
  margin-bottom: 20px;
}
.balance-display {
  margin-bottom: 10px;
}
</style>
