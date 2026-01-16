<script setup>
import { computed } from 'vue';
import { useShopStore } from '../stores/shop';
import dayjs from 'dayjs';

const props = defineProps(['shop']);
const shopStore = useShopStore();

const formatDate = (d) => dayjs(d).format('MM-DD HH:mm:ss');

const getCurrencyName = (id) => {
  if (!id) return '';
  const c = props.shop.currencies?.find(x => x.id === id);
  return c ? c.name : `ID:${id}`;
};

const typeText = (row) => {
  const t = row.type;
  const map = {
    purchase: '购买',
    grant_balance: '调整余额',
    self_adjust_personal: '自助调个人余额',
    self_adjust_team: '自助调队伍余额',
    wallet_mode_switch: '切换钱包模式',
    char_name: '修改角色名',
    member_role: '修改身份',
    member_kick: '踢出成员',
    invite_create: '生成邀请码',
    invite_delete: '删除邀请码',
    stall_create: '新建摊位',
    stall_update: '修改摊位',
    stall_delete: '删除摊位',
    product_created: '创建商品',
    product_update: '修改商品',
    product_reorder: '商品排序',
    currency_create: '创建币种',
    currency_rename: '币种改名',
    currency_delete: '删除币种',
    inventory_adjust: '修改背包',
    self_inventory_adjust: '自助改背包',
    inventory_rename: '背包改名',
    self_inventory_rename: '自助背包改名',
    self_inventory_reorder: '背包排序',
  };
  return map[t] || t || '未知';
};

const formatAmount = (row) => {
  const currency = getCurrencyName(row.currencyId);
  if (!currency) return { deltaText: '', afterText: '', delta: 0 };
  const before = row.beforeAmount;
  const after = row.afterAmount;
  if (before !== undefined && before !== null && after !== undefined && after !== null) {
    const delta = after - before;
    const sign = delta > 0 ? '+' : '';
    return { deltaText: `${sign}${delta} ${currency}`, afterText: `${after} ${currency}`, delta };
  }
  if (!row.amount) return { deltaText: '', afterText: '', delta: 0 };
  const sign = row.amount > 0 ? '+' : '';
  return { deltaText: `${sign}${row.amount} ${currency}`, afterText: '', delta: row.amount };
};

const amountMeta = (row) => formatAmount(row);
</script>

<template>
  <div class="shop-logs">
    <el-table :data="shopStore.logs" style="width: 100%" size="small" stripe>
      <el-table-column prop="createdAt" label="时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="120">
        <template #default="{ row }">
          <span>{{ row.actorName || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="140">
        <template #default="{ row }">{{ typeText(row) }}</template>
      </el-table-column>
      <el-table-column prop="content" label="内容" min-width="200" />
      <el-table-column v-if="['OWNER', 'CLERK'].includes(props.shop.member?.role)" label="对象" width="120">
        <template #default="{ row }">
          <span>{{ row.memberName || (row.memberId ? `ID:${row.memberId}` : '-') }}</span>
        </template>
      </el-table-column>
      <el-table-column label="变化" width="140">
        <template #default="{ row }">
          <span v-if="amountMeta(row).deltaText" :class="{ 'positive': amountMeta(row).delta > 0, 'negative': amountMeta(row).delta < 0 }">
            {{ amountMeta(row).deltaText }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="变化后" width="140">
        <template #default="{ row }">
          <span v-if="amountMeta(row).afterText">{{ amountMeta(row).afterText }}</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.positive {
  color: #67c23a;
}
.negative {
  color: #f56c6c;
}
</style>
