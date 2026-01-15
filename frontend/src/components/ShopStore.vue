<script setup>
import { ref, computed, reactive } from 'vue';
import { useShopStore } from '../stores/shop';
import * as shopApi from '../api/shops';
import { ElMessage } from 'element-plus';

const props = defineProps(['shop']);
const shopStore = useShopStore();

const activeStallId = ref('');
const isManager = computed(() => ['OWNER', 'CLERK'].includes(props.shop.member?.role));

const stalls = computed(() => {
  if (activeStallId.value === '' && shopStore.stalls.length > 0) {
    activeStallId.value = String(shopStore.stalls[0].id);
  }
  return shopStore.stalls;
});

const selectedStall = computed(() => shopStore.stalls.find(s => String(s.id) === activeStallId.value));

// Purchase
const purchaseDialog = reactive({ visible: false, product: null, qty: 1 });

const openPurchase = (product) => {
  purchaseDialog.product = product;
  purchaseDialog.qty = 1;
  purchaseDialog.visible = true;
};

const handlePurchase = async () => {
  try {
    await shopApi.purchaseProduct(props.shop.shop.id, {
      productId: purchaseDialog.product.id,
      quantity: purchaseDialog.qty
    });
    ElMessage.success('购买成功');
    purchaseDialog.visible = false;
    shopStore.refreshCurrentShop();
  } catch (err) {
    // handled
  }
};

const getCurrencyName = (id) => {
  const c = props.shop.currencies?.find(x => x.id === id);
  return c ? c.name : 'Unknown';
};

const formatPrice = (p) => {
  if (p.priceState !== 'PRICED') return '无标价';
  return `${p.priceAmount} ${getCurrencyName(p.priceCurrencyId)}`;
};
</script>

<template>
  <div class="shop-store">
    <div class="store-layout" v-if="stalls.length > 0">
      <aside class="stall-sidebar">
        <el-menu :default-active="activeStallId" @select="id => activeStallId = id">
          <el-menu-item v-for="s in stalls" :key="s.id" :index="String(s.id)">
            <span>{{ s.name }}</span>
          </el-menu-item>
        </el-menu>
      </aside>
      
      <main class="stall-content" v-if="selectedStall">
        <div class="stall-header">
          <h3>{{ selectedStall.name }}</h3>
          <p class="desc">{{ selectedStall.description }}</p>
        </div>
        
        <el-row :gutter="16">
          <el-col :xs="12" :sm="8" :md="6" v-for="p in selectedStall.products" :key="p.id">
            <el-card shadow="hover" class="product-card" @click="openPurchase(p)">
              <div class="product-icon">{{ p.icon || '📦' }}</div>
              <div class="product-info">
                <div class="name">{{ p.name }}</div>
                <div class="price">{{ formatPrice(p) }}</div>
                <div class="stock" v-if="p.isLimitStock">库存: {{ p.stock }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </main>
    </div>
    <div v-else class="empty-text">暂无摊位</div>

    <!-- Purchase Dialog -->
    <el-dialog v-model="purchaseDialog.visible" title="购买商品" width="400px">
      <div v-if="purchaseDialog.product">
        <div class="product-preview">
          <div class="icon">{{ purchaseDialog.product.icon || '📦' }}</div>
          <h4>{{ purchaseDialog.product.name }}</h4>
          <p>{{ purchaseDialog.product.description }}</p>
          <div class="price-tag">{{ formatPrice(purchaseDialog.product) }}</div>
        </div>
        <div class="qty-control">
          <span>数量：</span>
          <el-input-number v-model="purchaseDialog.qty" :min="1" :max="purchaseDialog.product.isLimitStock ? purchaseDialog.product.stock : 999" />
        </div>
      </div>
      <template #footer>
        <el-button @click="purchaseDialog.visible = false">取消</el-button>
        <el-button 
          type="primary" 
          @click="handlePurchase" 
          :disabled="purchaseDialog.product?.priceState !== 'PRICED' || (purchaseDialog.product?.isLimitStock && purchaseDialog.product?.stock <= 0)"
        >
          购买
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.store-layout {
  display: flex;
  gap: 20px;
  min-height: 400px;
}
.stall-sidebar {
  width: 200px;
  flex-shrink: 0;
}
.stall-content {
  flex-grow: 1;
}
.stall-header {
  margin-bottom: 20px;
}
.stall-header h3 {
  margin: 0;
}
.stall-header .desc {
  color: #909399;
  margin: 4px 0 0;
}
.product-card {
  margin-bottom: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}
.product-card:hover {
  transform: translateY(-2px);
}
.product-icon {
  font-size: 32px;
  text-align: center;
  margin-bottom: 8px;
}
.product-info {
  text-align: center;
}
.product-info .name {
  font-weight: bold;
  margin-bottom: 4px;
}
.product-info .price {
  color: #f56c6c;
  font-size: 14px;
}
.product-info .stock {
  color: #909399;
  font-size: 12px;
}
.product-preview {
  text-align: center;
  margin-bottom: 20px;
}
.product-preview .icon {
  font-size: 48px;
}
.product-preview .price-tag {
  color: #f56c6c;
  font-size: 18px;
  font-weight: bold;
  margin-top: 8px;
}
.qty-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.empty-text {
  text-align: center;
  color: #909399;
  padding: 40px;
}
</style>
