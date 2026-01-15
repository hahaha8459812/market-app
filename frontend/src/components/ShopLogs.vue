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

const formatAmount = (row) => {
  if (!row.amount) return '';
  // prefer calculated diff
  let val = row.amount;
  if (row.afterAmount !== undefined && row.beforeAmount !== undefined) {
    val = row.afterAmount - row.beforeAmount;
  }
  const sign = val > 0 ? '+' : '';
  const currency = getCurrencyName(row.currencyId);
  return `${sign}${val} ${currency}`;
};
</script>

<template>
  <div class="shop-logs">
    <el-table :data="shopStore.logs" style="width: 100%" size="small" stripe>
      <el-table-column prop="createdAt" label="时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="140" />
      <el-table-column prop="content" label="内容" min-width="200" />
      <el-table-column label="金额变动" width="120">
        <template #default="{ row }">
          <span :class="{ 'positive': (row.afterAmount - row.beforeAmount) > 0, 'negative': (row.afterAmount - row.beforeAmount) < 0 }">
            {{ formatAmount(row) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column v-if="['OWNER', 'CLERK'].includes(props.shop.member?.role)" prop="memberId" label="成员ID" width="80" />
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
