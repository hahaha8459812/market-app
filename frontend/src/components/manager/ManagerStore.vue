<script setup>
import { reactive, ref } from 'vue';
import { useShopStore } from '../../stores/shop';
import * as shopApi from '../../api/shops';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps(['shop']);
const shopStore = useShopStore();

// Stalls
const stallDialog = ref(false);
const stallForm = reactive({ name: '', description: '' });

const handleCreateStall = async () => {
  if (!stallForm.name) return ElMessage.warning('请输入摊位名');
  try {
    await shopApi.createStall(props.shop.shop.id, stallForm);
    ElMessage.success('摊位已创建');
    stallDialog.value = false;
    stallForm.name = '';
    stallForm.description = '';
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const handleToggleStall = async (stall) => {
  try {
    await shopApi.updateStall(props.shop.shop.id, stall.id, { isActive: !stall.isActive });
    ElMessage.success('状态已更新');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const handleDeleteStall = async (stall) => {
  try {
    await ElMessageBox.confirm(
      `确认删除摊位「${stall.name}」？该摊位下所有商品也会被删除，此操作不可撤销。`,
      '危险操作',
      { type: 'error', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
    await shopApi.deleteStall(props.shop.shop.id, stall.id);
    ElMessage.success('摊位已删除');
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // cancel or handled by interceptor
  }
};

// Products
const productDialog = reactive({ visible: false, mode: 'add', stallId: null, productId: null, form: {} });
const initProductForm = () => ({
  name: '', icon: '', priceState: 'UNPRICED', priceAmount: 0, priceCurrencyId: null, stock: 0, isLimitStock: true, isActive: true, description: ''
});

const openAddProduct = (stallId) => {
  productDialog.mode = 'add';
  productDialog.stallId = stallId;
  productDialog.productId = null;
  productDialog.form = initProductForm();
  productDialog.visible = true;
};

const openEditProduct = (stallId, product) => {
  productDialog.mode = 'edit';
  productDialog.stallId = stallId;
  productDialog.productId = product.id;
  productDialog.form = { ...product };
  productDialog.visible = true;
};

const handleSaveProduct = async () => {
  const { form, stallId, productId, mode } = productDialog;
  if (!form.name) return ElMessage.warning('请输入名称');
  
  const payload = { ...form };
  if (payload.priceState === 'PRICED') {
    if (!payload.priceCurrencyId) return ElMessage.warning('请选择币种');
  } else {
    delete payload.priceAmount;
    delete payload.priceCurrencyId;
  }

  try {
    if (mode === 'add') {
      await shopApi.addProduct(stallId, payload);
    } else {
      await shopApi.updateProduct(props.shop.shop.id, productId, payload);
    }
    ElMessage.success('商品已保存');
    productDialog.visible = false;
    shopStore.refreshCurrentShop(true);
  } catch (err) {
    // handled
  }
};

const getCurrencyName = (id) => {
  const c = props.shop.currencies?.find(x => x.id === id);
  return c ? c.name : 'Unknown';
};

// Drag reorder products (manager only)
const dragState = reactive({ stallId: null, productId: null });

const onDragStart = (stall, product, e) => {
  dragState.stallId = stall.id;
  dragState.productId = product.id;
  e.dataTransfer?.setData('text/plain', String(product.id));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
};

const onDragEnd = () => {
  dragState.stallId = null;
  dragState.productId = null;
};

const moveInArray = (arr, fromIndex, toIndex) => {
  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const submitReorder = async (stall) => {
  await shopApi.reorderProducts(props.shop.shop.id, stall.id, stall.products.map((p) => p.id));
};

const onDropOnProduct = async (stall, targetProduct, e) => {
  e.preventDefault();
  if (dragState.stallId !== stall.id) return;

  const fromId = Number(e.dataTransfer?.getData('text/plain') || dragState.productId);
  if (!fromId) return;

  const fromIndex = stall.products.findIndex((p) => p.id === fromId);
  const toIndex = stall.products.findIndex((p) => p.id === targetProduct.id);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  stall.products = moveInArray(stall.products, fromIndex, toIndex);
  try {
    await submitReorder(stall);
    ElMessage.success('排序已更新');
  } catch (err) {
    shopStore.refreshCurrentShop(true);
  } finally {
    onDragEnd();
  }
};

const onDropToEnd = async (stall, e) => {
  e.preventDefault();
  if (dragState.stallId !== stall.id) return;

  const fromId = Number(e.dataTransfer?.getData('text/plain') || dragState.productId);
  if (!fromId) return;

  const fromIndex = stall.products.findIndex((p) => p.id === fromId);
  if (fromIndex < 0) return;
  if (fromIndex === stall.products.length - 1) return;

  stall.products = moveInArray(stall.products, fromIndex, stall.products.length - 1);
  try {
    await submitReorder(stall);
    ElMessage.success('排序已更新');
  } catch (err) {
    shopStore.refreshCurrentShop(true);
  } finally {
    onDragEnd();
  }
};
</script>

<template>
  <div class="manager-store">
    <div class="actions-bar">
      <el-button type="primary" icon="Plus" @click="stallDialog = true">新建摊位</el-button>
    </div>

    <div v-for="stall in shopStore.stalls" :key="stall.id" class="stall-block">
      <div class="stall-header">
        <div class="left">
          <span class="stall-name">{{ stall.name }}</span>
          <el-tag size="small" :type="stall.isActive ? 'success' : 'info'">{{ stall.isActive ? '启用' : '隐藏' }}</el-tag>
        </div>
        <div class="right">
          <el-button size="small" @click="handleToggleStall(stall)">{{ stall.isActive ? '隐藏' : '启用' }}</el-button>
          <el-button size="small" type="primary" @click="openAddProduct(stall.id)">添加商品</el-button>
          <el-button size="small" type="danger" plain @click="handleDeleteStall(stall)">删除摊位</el-button>
        </div>
      </div>

      <div class="product-list" v-if="stall.products?.length">
        <div
          v-for="p in stall.products"
          :key="p.id"
          class="product-row"
          @dragover.prevent
          @drop="onDropOnProduct(stall, p, $event)"
        >
          <div class="cell name">{{ p.name }}</div>
          <div class="cell price">
            <span v-if="p.priceState === 'PRICED'">{{ p.priceAmount }} {{ getCurrencyName(p.priceCurrencyId) }}</span>
            <span v-else>无标价</span>
          </div>
          <div class="cell stock">{{ p.isLimitStock ? p.stock : '∞' }}</div>
          <div class="cell status">
            <el-tag size="small" v-if="p.isActive">上架</el-tag>
            <el-tag size="small" type="info" v-else>下架</el-tag>
          </div>
          <div class="cell actions">
            <el-button type="text" @click="openEditProduct(stall.id, p)">编辑</el-button>
          </div>

          <div
            class="drag-handle"
            title="拖拽排序"
            draggable="true"
            @dragstart="onDragStart(stall, p, $event)"
            @dragend="onDragEnd"
          >
            <span class="dot d1" />
            <span class="dot d2" />
            <span class="dot d3" />
          </div>
        </div>

        <div class="drop-end" @dragover.prevent @drop="onDropToEnd(stall, $event)">
          拖到这里放到末尾
        </div>
      </div>
      <div v-else class="empty-products">暂无商品</div>
    </div>

    <!-- Stall Dialog -->
    <el-dialog v-model="stallDialog" title="新建摊位" width="400px">
      <el-form :model="stallForm">
        <el-form-item label="名称"><el-input v-model="stallForm.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="stallForm.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stallDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateStall">创建</el-button>
      </template>
    </el-dialog>

    <!-- Product Dialog -->
    <el-dialog v-model="productDialog.visible" :title="productDialog.mode === 'add' ? '添加商品' : '编辑商品'" width="500px">
      <el-form :model="productDialog.form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="productDialog.form.name" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="productDialog.form.icon" placeholder="Emoji" /></el-form-item>
        <el-form-item label="定价状态">
          <el-select v-model="productDialog.form.priceState">
            <el-option label="无标价" value="UNPRICED" />
            <el-option label="定价" value="PRICED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="productDialog.form.priceState === 'PRICED'" label="价格">
          <div style="display:flex; gap:10px">
            <el-input-number v-model="productDialog.form.priceAmount" :min="0" style="flex:1" />
            <el-select v-model="productDialog.form.priceCurrencyId" placeholder="币种" style="flex:1">
              <el-option v-for="c in props.shop.currencies.filter(x => x.isActive)" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="限制库存">
          <el-switch v-model="productDialog.form.isLimitStock" />
        </el-form-item>
        <el-form-item label="库存" v-if="productDialog.form.isLimitStock">
          <el-input-number v-model="productDialog.form.stock" :min="0" />
        </el-form-item>
        <el-form-item label="上架">
          <el-switch v-model="productDialog.form.isActive" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="productDialog.form.description" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="productDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveProduct">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.actions-bar {
  margin-bottom: 20px;
}
.stall-block {
  margin-bottom: 30px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 16px;
}
.stall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.stall-name {
  font-size: 18px;
  font-weight: bold;
  margin-right: 10px;
}

.product-list {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}

.product-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 160px 90px 90px 80px;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}

.product-row:first-child {
  border-top: none;
}

.cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drag-handle {
  position: absolute;
  right: 10px;
  bottom: 8px;
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

.drop-end {
  padding: 8px 12px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
  border-top: 1px dashed #ebeef5;
  user-select: none;
}

.empty-products {
  color: #909399;
  font-size: 14px;
}
</style>
