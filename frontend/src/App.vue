<script setup>
import { reactive, ref, onMounted } from 'vue';
import axios from 'axios';
import { ElMessage } from 'element-plus';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
});

const user = ref(null);
const loading = ref(false);
const shops = ref([]);
const wsStatus = ref('disconnected');
let ws = null;

const authForm = reactive({
  username: '',
  password: '',
});

const shopForm = reactive({
  name: '示例小店',
  currencyRules: '{ "main": "金", "rates": { "金": 1, "银": 10, "铜": 100 } }',
});

const stallForm = reactive({ shopId: null, name: '旅者摊位', description: '默认摊位' });
const productForm = reactive({
  stallId: null,
  name: '治疗药水',
  price: 10,
  stock: 5,
  icon: '🧪',
  isLimitStock: true,
});
const grantForm = reactive({ shopId: null, charName: '测试角色', amount: 100 });
const purchaseForm = reactive({ shopId: null, charName: '测试角色', productId: null, quantity: 1 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('market_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (err) => {
  const msg = err?.response?.data?.message || err.message || '请求失败';
  ElMessage.error(msg);
};

const afterAuth = (data) => {
  localStorage.setItem('market_token', data.accessToken);
  user.value = data.user;
  connectWs();
  fetchShops();
};

const login = async () => {
  loading.value = true;
  try {
    const res = await api.post('/auth/login', { ...authForm });
    afterAuth(res.data);
    ElMessage.success('登录成功');
  } catch (err) {
    handleError(err);
  } finally {
    loading.value = false;
  }
};

const fetchMe = async () => {
  const token = localStorage.getItem('market_token');
  if (!token) return;
  try {
    const res = await api.get('/auth/me');
    user.value = res.data;
    connectWs();
    fetchShops();
  } catch {
    localStorage.removeItem('market_token');
  }
};

const fetchShops = async () => {
  if (!user.value) return;
  try {
    const res = await api.get('/shops');
    shops.value = res.data;
  } catch (err) {
    handleError(err);
  }
};

const createShop = async () => {
  try {
    const currencyRules = JSON.parse(shopForm.currencyRules || '{}');
    await api.post('/shops', { name: shopForm.name, currencyRules });
    ElMessage.success('创建店铺成功');
    fetchShops();
  } catch (err) {
    handleError(err);
  }
};

const createStall = async () => {
  if (!stallForm.shopId) return ElMessage.warning('请填写店铺ID');
  try {
    await api.post(`/shops/${stallForm.shopId}/stalls`, {
      name: stallForm.name,
      description: stallForm.description,
    });
    ElMessage.success('创建摊位成功');
    fetchShops();
  } catch (err) {
    handleError(err);
  }
};

const createProduct = async () => {
  if (!productForm.stallId) return ElMessage.warning('请填写摊位ID');
  try {
    await api.post(`/shops/stalls/${productForm.stallId}/products`, {
      name: productForm.name,
      icon: productForm.icon,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      isLimitStock: productForm.isLimitStock,
    });
    ElMessage.success('新增商品成功');
    fetchShops();
  } catch (err) {
    handleError(err);
  }
};

const grantBalance = async () => {
  if (!grantForm.shopId) return ElMessage.warning('请填写店铺ID');
  try {
    await api.post(`/shops/${grantForm.shopId}/grant-balance`, {
      charName: grantForm.charName,
      amount: Number(grantForm.amount),
    });
    ElMessage.success('发放余额成功');
  } catch (err) {
    handleError(err);
  }
};

const purchase = async () => {
  if (!purchaseForm.shopId || !purchaseForm.productId) {
    return ElMessage.warning('请填写店铺ID与商品ID');
  }
  try {
    await api.post(`/shops/${purchaseForm.shopId}/purchase`, {
      charName: purchaseForm.charName,
      productId: Number(purchaseForm.productId),
      quantity: Number(purchaseForm.quantity),
    });
    ElMessage.success('购买完成');
    fetchShops();
  } catch (err) {
    handleError(err);
  }
};

onMounted(() => {
  fetchMe();
});

const connectWs = () => {
  if (ws) return;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}/ws`;
  wsStatus.value = 'connecting';
  ws = new WebSocket(url);
  ws.onopen = () => {
    wsStatus.value = 'connected';
  };
  ws.onclose = () => {
    wsStatus.value = 'disconnected';
    ws = null;
    setTimeout(connectWs, 2000);
  };
  ws.onerror = () => {
    wsStatus.value = 'error';
  };
  ws.onmessage = () => {
    // noop for demo (server uses ping/pong for heartbeat)
  };
};
</script>

<template>
  <div class="page">
    <header class="hero">
      <div>
        <h1>集市 Demo</h1>
        <p>单容器部署版 · 配置文件超管登录 → 管理店铺/库存</p>
      </div>
      <div v-if="user" class="user-tag">
        <strong>{{ user.username }}</strong>
        <span class="role">{{ user.role }}</span>
        <span class="role">WS: {{ wsStatus }}</span>
      </div>
    </header>

    <div v-if="!user" class="auth-card">
      <el-card>
        <el-alert
          title="超级管理员账号来自 config.toml"
          type="info"
          show-icon
          :closable="false"
          style="margin-bottom: 12px"
        />
        <el-form :model="authForm" label-width="80px" class="auth-form">
          <el-form-item label="用户名">
            <el-input v-model="authForm.username" placeholder="admin" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="authForm.password" type="password" placeholder="至少6位" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="login">登录</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <div v-else class="grid">
      <el-card>
        <template #header>店铺配置</template>
        <el-form :model="shopForm" label-width="90px">
          <el-form-item label="店名">
            <el-input v-model="shopForm.name" />
          </el-form-item>
          <el-form-item label="货币规则">
            <el-input
              type="textarea"
              v-model="shopForm.currencyRules"
              rows="3"
              placeholder='{ "main": "金", "rates": { "金": 1, "银": 10, "铜": 100 } }'
            />
          </el-form-item>
          <el-button type="primary" @click="createShop">创建店铺</el-button>
        </el-form>
      </el-card>

      <el-card>
        <template #header>摊位与商品</template>
        <el-form :model="stallForm" label-width="90px">
          <el-form-item label="店铺ID">
            <el-input v-model="stallForm.shopId" />
          </el-form-item>
          <el-form-item label="摊位名">
            <el-input v-model="stallForm.name" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="stallForm.description" />
          </el-form-item>
          <el-button type="primary" plain @click="createStall">新增摊位</el-button>
        </el-form>

        <el-divider />

        <el-form :model="productForm" label-width="90px">
          <el-form-item label="摊位ID">
            <el-input v-model="productForm.stallId" />
          </el-form-item>
          <el-form-item label="商品名">
            <el-input v-model="productForm.name" />
          </el-form-item>
          <el-form-item label="价格(最小单位)">
            <el-input v-model="productForm.price" />
          </el-form-item>
          <el-form-item label="库存">
            <el-input v-model="productForm.stock" />
          </el-form-item>
          <el-form-item label="图标">
            <el-input v-model="productForm.icon" />
          </el-form-item>
          <el-form-item label="限库存">
            <el-switch v-model="productForm.isLimitStock" />
          </el-form-item>
          <el-button type="primary" plain @click="createProduct">新增商品</el-button>
        </el-form>
      </el-card>

      <el-card>
        <template #header>余额 & 购买</template>
        <el-form :model="grantForm" label-width="90px">
          <el-form-item label="店铺ID">
            <el-input v-model="grantForm.shopId" />
          </el-form-item>
          <el-form-item label="角色名">
            <el-input v-model="grantForm.charName" />
          </el-form-item>
          <el-form-item label="金额">
            <el-input v-model="grantForm.amount" />
          </el-form-item>
          <el-button type="success" @click="grantBalance">发放余额</el-button>
        </el-form>
        <el-divider />
        <el-form :model="purchaseForm" label-width="90px">
          <el-form-item label="店铺ID">
            <el-input v-model="purchaseForm.shopId" />
          </el-form-item>
          <el-form-item label="角色名">
            <el-input v-model="purchaseForm.charName" />
          </el-form-item>
          <el-form-item label="商品ID">
            <el-input v-model="purchaseForm.productId" />
          </el-form-item>
          <el-form-item label="数量">
            <el-input v-model="purchaseForm.quantity" />
          </el-form-item>
          <el-button type="warning" @click="purchase">购买</el-button>
        </el-form>
      </el-card>

      <el-card class="shops-card">
        <template #header>
          <div class="flex">
            <span>店铺列表</span>
            <el-button type="primary" link @click="fetchShops">刷新</el-button>
          </div>
        </template>
        <div v-if="!shops.length">暂无店铺</div>
        <div v-else class="shop-list">
          <el-collapse>
            <el-collapse-item v-for="shop in shops" :key="shop.id" :name="shop.id">
              <template #title>
                <div class="shop-header">
                  <strong>{{ shop.name }}</strong>
                  <span class="meta">ID {{ shop.id }} · 邀请码 {{ shop.inviteCode }}</span>
                </div>
              </template>
              <div v-if="shop.stalls.length === 0">暂无摊位</div>
              <div v-for="stall in shop.stalls" :key="stall.id" class="stall">
                <div class="stall-title">
                  <strong>{{ stall.name }}</strong>
                  <span class="meta">ID {{ stall.id }}</span>
                </div>
                <el-table :data="stall.products" size="small" style="width: 100%">
                  <el-table-column prop="id" label="ID" width="60" />
                  <el-table-column label="图标" width="70">
                    <template #default="{ row }">
                      <span v-if="row.icon && row.icon.startsWith('http')">
                        <img :src="row.icon" alt="" class="icon" />
                      </span>
                      <span v-else>{{ row.icon || '🧩' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="name" label="名称" />
                  <el-table-column prop="price" label="价格(最小单位)" />
                  <el-table-column prop="stock" label="库存" />
                </el-table>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero h1 {
  margin: 0;
  font-size: 28px;
}

.hero p {
  margin: 4px 0 0;
  color: #888;
}

.user-tag {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.auth-card {
  max-width: 480px;
  margin: 0 auto;
}

.auth-toggle {
  margin-bottom: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shop-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.meta {
  color: #888;
  font-size: 12px;
}

.stall {
  margin-top: 8px;
  border: 1px dashed #e5e5e5;
  border-radius: 6px;
  padding: 8px;
}

.stall-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.icon {
  width: 24px;
  height: 24px;
}

.shops-card {
  grid-column: 1 / -1;
}

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
