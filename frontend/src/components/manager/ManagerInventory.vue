<script setup>
import { reactive, ref, computed } from 'vue';
import { useShopStore } from '../../stores/shop';
import * as shopApi from '../../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps(['shop', 'members']);
const shopStore = useShopStore();

const activeMemberId = ref(null);
const memberInventory = ref([]);

const customers = computed(() => (props.members || []).filter(m => m.role === 'CUSTOMER'));

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
const invAdjust = reactive({ name: '', quantity: 1 });

const handleInvAdjust = async (sign) => {
  if (!invAdjust.name) return ElMessage.warning('请输入物品名');
  const qty = Math.floor(Math.abs(invAdjust.quantity));
  if (qty === 0) return;
  
  try {
    await shopApi.adjustInventory(props.shop.shop.id, {
      memberId: activeMemberId.value,
      name: invAdjust.name,
      quantityDelta: qty * sign
    });
    ElMessage.success('背包已更新');
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // handled
  }
};

const handleRenameItem = async (row) => {
  if (!activeMemberId.value) return;
  try {
    const res = await ElMessageBox.prompt('请输入新的物品名', '物品改名', {
      inputValue: row.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v).trim() ? true : '物品名不能为空'),
    });
    const newName = String(res.value).trim();
    if (!newName || newName === row.name) return;
    await shopApi.renameInventory(props.shop.shop.id, { memberId: activeMemberId.value, oldName: row.name, newName });
    ElMessage.success('已改名');
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // cancel or handled
  }
};

const handleDeleteItem = async (row) => {
  if (!activeMemberId.value) return;
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？`, '提示', { type: 'warning' });
    await shopApi.adjustInventory(props.shop.shop.id, { memberId: activeMemberId.value, name: row.name, quantityDelta: -row.quantity });
    ElMessage.success('已删除');
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // cancel or handled
  }
};

const handleIncItem = async (row) => {
  if (!activeMemberId.value) return;
  try {
    await shopApi.adjustInventory(props.shop.shop.id, { memberId: activeMemberId.value, name: row.name, quantityDelta: 1 });
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // handled
  }
};

const handleDecItem = async (row) => {
  if (!activeMemberId.value) return;
  try {
    if (row.quantity === 1) {
      await ElMessageBox.confirm(`确认将「${row.name}」数量减为 0 并删除？`, '提示', { type: 'warning' });
    }
    await shopApi.adjustInventory(props.shop.shop.id, { memberId: activeMemberId.value, name: row.name, quantityDelta: -1 });
    loadMemberInventory(activeMemberId.value);
  } catch (err) {
    // cancel or handled
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
        <el-button link :icon="ArrowLeft" @click="backToList">返回列表</el-button>
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
              <el-table-column prop="name" label="物品" />
              <el-table-column label="数量" width="140">
                <template #default="{ row }">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <el-button size="small" @click="handleDecItem(row)">-</el-button>
                    <span style="min-width:24px; text-align:center;">{{ row.quantity }}</span>
                    <el-button size="small" @click="handleIncItem(row)">+</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="160">
                <template #default="{ row }">
                  <el-button size="small" @click="handleRenameItem(row)">改名</el-button>
                  <el-button size="small" type="danger" plain @click="handleDeleteItem(row)">删除</el-button>
                </template>
              </el-table-column>
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
