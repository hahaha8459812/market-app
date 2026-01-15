<script setup>
import { reactive, computed } from 'vue';
import { useShopStore } from '../stores/shop';
import * as shopApi from '../api/shops';
import { ElMessage } from 'element-plus';

const props = defineProps(['shop']);
const shopStore = useShopStore();

const balances = computed(() => {
  if (props.shop.shop.walletMode === 'TEAM') {
    return props.shop.balances.team || [];
  }
  return props.shop.balances.personal || [];
});

const getCurrencyName = (id) => {
  const c = props.shop.currencies?.find(x => x.id === id);
  return c ? c.name : 'Unknown';
};

// Self adjust
const adjustForm = reactive({ amount: 0, currencyId: null });

const handleSelfAdjust = async (sign) => {
  if (!adjustForm.currencyId) return ElMessage.warning('请选择币种');
  const amount = Math.floor(Math.abs(adjustForm.amount));
  if (amount === 0) return;
  
  try {
    await shopApi.selfAdjustBalance(props.shop.shop.id, {
      currencyId: adjustForm.currencyId,
      amount: amount * sign
    });
    ElMessage.success('余额已更新');
    adjustForm.amount = 0;
    shopStore.refreshCurrentShop();
  } catch (err) {
    // handled
  }
};

// Inventory Self Adjust
const invAdjust = reactive({ name: '', quantity: 1, icon: '', extraDesc: '' });

const handleInvSelfAdjust = async (sign) => {
  if (!invAdjust.name) return ElMessage.warning('请输入物品名');
  const qty = Math.floor(Math.abs(invAdjust.quantity));
  if (qty === 0) return;

  try {
    await shopApi.selfAdjustInventory(props.shop.shop.id, {
      name: invAdjust.name,
      quantityDelta: qty * sign,
      icon: invAdjust.icon,
      extraDesc: invAdjust.extraDesc
    });
    ElMessage.success('背包已更新');
    invAdjust.name = '';
    shopStore.refreshCurrentShop();
  } catch (err) {
    // handled
  }
};
</script>

<template>
  <div class="shop-inventory">
    <el-row :gutter="20">
      <el-col :xs="24" :md="8">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>钱包 ({{ props.shop.shop.walletMode === 'TEAM' ? '全队' : '个人' }})</span>
            </div>
          </template>
          <div v-if="balances.length === 0" class="empty-text">余额为 0</div>
          <div v-else class="balance-list">
            <div v-for="b in balances" :key="b.currencyId" class="balance-item">
              <span class="currency">{{ getCurrencyName(b.currencyId) }}</span>
              <span class="amount">{{ b.amount }}</span>
            </div>
          </div>
          
          <el-divider />
          <div class="adjust-box">
            <h4>自助调整余额</h4>
            <div class="info-tip">用于跑团结算/场外花销</div>
            <el-select v-model="adjustForm.currencyId" placeholder="选择币种" style="width: 100%; margin-bottom: 8px">
              <el-option v-for="c in props.shop.currencies.filter(x => x.isActive)" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-input-number v-model="adjustForm.amount" :min="0" style="width: 100%; margin-bottom: 8px" />
            <div class="btn-group">
              <el-button type="success" :disabled="!props.shop.shop.allowCustomerInc" @click="handleSelfAdjust(1)">增加</el-button>
              <el-button type="danger" :disabled="!props.shop.shop.allowCustomerDec" @click="handleSelfAdjust(-1)">减少</el-button>
            </div>
          </div>
        </el-card>

        <el-card class="box-card" style="margin-top: 20px">
          <template #header>自助物品增删</template>
          <el-form label-width="60px">
            <el-form-item label="物品名">
              <el-input v-model="invAdjust.name" />
            </el-form-item>
            <el-form-item label="数量">
              <el-input-number v-model="invAdjust.quantity" :min="1" />
            </el-form-item>
            <el-form-item label="图标">
              <el-input v-model="invAdjust.icon" placeholder="Emoji" />
            </el-form-item>
             <el-form-item label="备注">
              <el-input v-model="invAdjust.extraDesc" />
            </el-form-item>
            <div class="btn-group">
              <el-button type="success" @click="handleInvSelfAdjust(1)">获得</el-button>
              <el-button type="danger" @click="handleInvSelfAdjust(-1)">消耗</el-button>
            </div>
          </el-form>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :md="16">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>我的背包</span>
            </div>
          </template>
          <el-table :data="shopStore.inventory" style="width: 100%">
            <el-table-column label="图标" width="70">
              <template #default="{ row }">
                <span class="emoji-icon">{{ row.icon || '📦' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="物品名" />
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column prop="extraDesc" label="备注" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.balance-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f2f5;
}
.balance-item:last-child {
  border-bottom: none;
}
.amount {
  font-weight: bold;
  font-size: 18px;
}
.adjust-box h4 {
  margin: 0 0 8px 0;
}
.info-tip {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.btn-group {
  display: flex;
  gap: 10px;
}
.btn-group .el-button {
  flex: 1;
}
.emoji-icon {
  font-size: 24px;
}
.empty-text {
  color: #909399;
  text-align: center;
  padding: 10px;
}
</style>
