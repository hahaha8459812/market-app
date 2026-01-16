<script setup>
import { reactive, computed, ref, watch } from 'vue';
import { useShopStore } from '../stores/shop';
import * as shopApi from '../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';

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

// Inventory list (local for drag reorder)
const inventory = ref([]);
watch(
  () => shopStore.inventory,
  (val) => {
    inventory.value = (val || []).map((x) => ({ ...x }));
  },
  { immediate: true }
);

const dragState = reactive({ itemId: null });

const onDragStart = (row, e) => {
  dragState.itemId = row.id;
  e.dataTransfer?.setData('text/plain', String(row.id));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
};

const onDragEnd = () => {
  dragState.itemId = null;
};

const moveInArray = (arr, fromIndex, toIndex) => {
  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const submitInventoryOrder = async () => {
  await shopApi.reorderInventory(props.shop.shop.id, inventory.value.map((x) => x.id));
};

const onDropOnItem = async (targetRow, e) => {
  e.preventDefault();
  const fromId = Number(e.dataTransfer?.getData('text/plain') || dragState.itemId);
  if (!fromId) return;
  const fromIndex = inventory.value.findIndex((x) => x.id === fromId);
  const toIndex = inventory.value.findIndex((x) => x.id === targetRow.id);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  inventory.value = moveInArray(inventory.value, fromIndex, toIndex);
  try {
    await submitInventoryOrder();
    ElMessage.success('排序已更新');
    shopStore.refreshCurrentShop();
  } catch (err) {
    shopStore.refreshCurrentShop();
  } finally {
    onDragEnd();
  }
};

const onDropToEnd = async (e) => {
  e.preventDefault();
  const fromId = Number(e.dataTransfer?.getData('text/plain') || dragState.itemId);
  if (!fromId) return;
  const fromIndex = inventory.value.findIndex((x) => x.id === fromId);
  if (fromIndex < 0) return;
  const toIndex = inventory.value.length - 1;
  if (fromIndex === toIndex) return;
  inventory.value = moveInArray(inventory.value, fromIndex, toIndex);
  try {
    await submitInventoryOrder();
    ElMessage.success('排序已更新');
    shopStore.refreshCurrentShop();
  } catch (err) {
    shopStore.refreshCurrentShop();
  } finally {
    onDragEnd();
  }
};

// Inventory add row (integrated)
const invAdd = reactive({ name: '', quantity: 1 });

const handleAddRowAdjust = async (sign) => {
  const name = String(invAdd.name || '').trim();
  if (!name) return ElMessage.warning('请输入物品名');
  const qty = Math.floor(Math.abs(invAdd.quantity));
  if (!qty) return;

  try {
    await shopApi.selfAdjustInventory(props.shop.shop.id, { name, quantityDelta: qty * sign });
    ElMessage.success('背包已更新');
    invAdd.name = '';
    invAdd.quantity = 1;
    shopStore.refreshCurrentShop();
  } catch (err) {
    // handled
  }
};

const handleRenameItem = async (row) => {
  try {
    const res = await ElMessageBox.prompt('请输入新的物品名', '物品改名', {
      inputValue: row.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v).trim() ? true : '物品名不能为空')
    });
    const newName = String(res.value).trim();
    if (!newName || newName === row.name) return;
    await shopApi.renameInventory(props.shop.shop.id, { oldName: row.name, newName });
    ElMessage.success('已改名');
    shopStore.refreshCurrentShop();
  } catch (err) {
    // cancel or handled
  }
};

const handleQtyChange = async (row, next, prev) => {
  if (prev === undefined || prev === null) return;
  const nextVal = Number(next);
  const prevVal = Number(prev);
  if (!Number.isFinite(nextVal) || !Number.isFinite(prevVal)) return;
  if (nextVal === prevVal) return;

  try {
    if (nextVal <= 0) {
      await ElMessageBox.confirm(`确认将「${row.name}」数量设为 0 并删除？`, '提示', { type: 'warning' });
      await shopApi.selfAdjustInventory(props.shop.shop.id, { name: row.name, quantityDelta: -row.quantity });
      ElMessage.success('已删除');
      shopStore.refreshCurrentShop();
      return;
    }
    const delta = nextVal - prevVal;
    await shopApi.selfAdjustInventory(props.shop.shop.id, { name: row.name, quantityDelta: delta });
    shopStore.refreshCurrentShop();
  } catch (err) {
    shopStore.refreshCurrentShop();
  }
};

const handleDeleteItem = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？`, '提示', { type: 'warning' });
    await shopApi.selfAdjustInventory(props.shop.shop.id, { name: row.name, quantityDelta: -row.quantity });
    ElMessage.success('已删除');
    shopStore.refreshCurrentShop();
  } catch (err) {
    // cancel or handled
  }
};
</script>

<template>
  <div class="shop-inventory">
    <el-row :gutter="20">
      <el-col :xs="24" :md="24">
        <el-card class="box-card">
          <template #header>
            <div class="header-wrap">
              <div class="wallet-bar">
                <div class="wallet-title">钱包（{{ props.shop.shop.walletMode === 'TEAM' ? '全队' : '个人' }}）</div>
                <div class="wallet-balances" v-if="balances.length">
                  <div v-for="b in balances" :key="b.currencyId" class="wallet-balance">
                    <span class="currency">{{ getCurrencyName(b.currencyId) }}</span>
                    <span class="amount">{{ b.amount }}</span>
                  </div>
                </div>
                <div class="wallet-empty" v-else>余额为 0</div>
              </div>

              <div class="wallet-adjust">
                <div class="adjust-title">自助调整余额</div>
                <el-select v-model="adjustForm.currencyId" placeholder="选择币种" class="adjust-currency">
                  <el-option v-for="c in props.shop.currencies.filter(x => x.isActive)" :key="c.id" :label="c.name" :value="c.id" />
                </el-select>
                <el-input-number v-model="adjustForm.amount" :min="0" class="adjust-amount" />
                <div class="adjust-buttons">
                  <el-button type="success" :disabled="!props.shop.shop.allowCustomerInc" @click="handleSelfAdjust(1)">增加</el-button>
                  <el-button type="danger" :disabled="!props.shop.shop.allowCustomerDec" @click="handleSelfAdjust(-1)">减少</el-button>
                </div>
              </div>
            </div>
          </template>

          <div class="inv-title">我的背包</div>

          <div class="inv-list" v-if="inventory.length">
            <div
              v-for="row in inventory"
              :key="row.id"
              class="inv-row"
              @dragover.prevent
              @drop="onDropOnItem(row, $event)"
            >
              <div class="cell name" :title="row.name">{{ row.name }}</div>
              <div class="cell qty">
                <el-input-number
                  :model-value="row.quantity"
                  :min="0"
                  :step="1"
                  controls-position="right"
                  @change="(next, prev) => handleQtyChange(row, next, prev)"
                />
              </div>
              <div class="cell actions">
                <el-button size="small" @click="handleRenameItem(row)">改名</el-button>
                <el-button size="small" type="danger" plain @click="handleDeleteItem(row)">删除</el-button>
              </div>
              <div
                class="drag-handle"
                title="拖拽排序"
                draggable="true"
                @click.stop
                @dragstart="onDragStart(row, $event)"
                @dragend="onDragEnd"
              >
                <span class="dot d1" />
                <span class="dot d2" />
                <span class="dot d3" />
              </div>
            </div>
          </div>
          <div v-else class="empty-text">背包为空</div>

          <div class="inv-add-row" @dragover.prevent @drop="onDropToEnd($event)">
            <div class="cell name">
              <el-input v-model="invAdd.name" placeholder="物品名" />
            </div>
            <div class="cell qty">
              <el-input-number v-model="invAdd.quantity" :min="1" :step="1" controls-position="right" />
            </div>
            <div class="cell actions">
              <el-button type="success" @click="handleAddRowAdjust(1)">获得</el-button>
              <el-button type="danger" @click="handleAddRowAdjust(-1)">消耗</el-button>
            </div>
            <div class="drop-end-hint">拖到这里放到末尾</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    </div>
</template>

<style scoped>
.empty-text {
  color: #909399;
  text-align: center;
  padding: 10px;
}

.header-wrap {
  display: flex;
  gap: 16px;
  align-items: stretch;
  flex-wrap: wrap;
}

.wallet-bar {
  flex: 1;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
}

.wallet-title {
  font-weight: 700;
  color: #303133;
}

.wallet-balances {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.wallet-balance {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #f0f0f0;
}

.wallet-balance .currency {
  color: #606266;
  font-size: 12px;
}

.wallet-balance .amount {
  font-weight: 800;
  font-size: 18px;
  color: #303133;
}

.wallet-empty {
  color: #909399;
  font-size: 13px;
}

.wallet-adjust {
  flex: 1;
  min-width: 320px;
  display: grid;
  grid-template-columns: 120px 1fr 180px;
  grid-template-areas:
    "title title title"
    "currency amount buttons";
  gap: 10px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
}

.adjust-title {
  grid-area: title;
  font-weight: 700;
  color: #303133;
}

.adjust-currency {
  grid-area: currency;
}

.adjust-amount {
  grid-area: amount;
  width: 100%;
}

.adjust-buttons {
  grid-area: buttons;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.inv-title {
  margin: 10px 0 12px;
  font-weight: 700;
  color: #303133;
}

.inv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inv-row,
.inv-add-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 180px 220px;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 10px;
}

.inv-add-row {
  margin-top: 10px;
  background: #fafafa;
}

.cell.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.drag-handle {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 16px;
  height: 16px;
  cursor: grab;
  opacity: 0.65;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  opacity: 1;
}

.dot {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #c0c4cc;
}

.dot.d1 {
  left: 0;
  top: 0;
}

.dot.d2 {
  left: 0;
  top: 7px;
}

.dot.d3 {
  left: 7px;
  top: 7px;
}

.drop-end-hint {
  position: absolute;
  right: 36px;
  bottom: 10px;
  font-size: 12px;
  color: #909399;
  user-select: none;
}

@media (max-width: 900px) {
  .wallet-adjust {
    grid-template-columns: 1fr;
    grid-template-areas:
      "title"
      "currency"
      "amount"
      "buttons";
  }
  .inv-row,
  .inv-add-row {
    grid-template-columns: 1fr;
  }
  .cell.actions {
    justify-content: flex-start;
  }
}
</style>
