<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue';
import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
});

const user = ref(null);
const loading = ref(false);
const myShops = ref([]);
const wsStatus = ref('disconnected');
let ws = null;
let subscribedShopId = null;

const topTab = ref('stats');
const customerTab = ref('home');
const managerTab = ref('home');

const selectedCustomerShopId = ref(null);
const selectedManagerShopId = ref(null);

const stats = computed(() => {
  const managed = myShops.value.filter((s) => s.role === 'OWNER' || s.role === 'CLERK').length;
  const joined = myShops.value.length;
  return { managed, joined };
});

const isSuperAdmin = computed(() => user.value?.role === 'SUPER_ADMIN');

const customerShops = computed(() => myShops.value.filter((s) => s.role === 'CUSTOMER'));
const managerShops = computed(() => myShops.value.filter((s) => s.role === 'OWNER' || s.role === 'CLERK'));

const customerContext = reactive({
  summary: null,
  stalls: [],
  members: [],
  inventory: [],
  logs: [],
});

const managerContext = reactive({
  summary: null,
  stalls: [],
  members: [],
  inventory: [],
  logs: [],
});

const managerBagState = reactive({
  selectedMemberId: null,
  inventory: [],
  adjust: { name: '', quantityDelta: 1, icon: '', extraDesc: '' },
});

const authForm = reactive({
  username: '',
  password: '',
});

const authMode = ref('login');
const registerForm = reactive({ username: '', password: '' });

const joinForm = reactive({ inviteCode: '', charName: '' });

const createShopForm = reactive({
  name: '示例小店',
});

const createStallForm = reactive({ name: '旅者摊位', description: '默认摊位' });
const createProductForm = reactive({
  stallId: null,
  name: '治疗药水',
  price: 10,
  stock: 5,
  icon: '🧪',
  isLimitStock: true,
});

const createWalletForm = reactive({ name: '队伍钱包A' });
const assignWalletForm = reactive({ memberId: null, walletId: null });
const grantForm = reactive({ memberId: null, amount: 100, target: 'personal' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('market_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (err) => {
  const msg = err?.response?.data?.message || err.message || '请求失败';
  ElMessage.error(msg);
};

const formatBalance = (raw, currencyRules) => {
  const value = Number(raw || 0);
  const rules = currencyRules || {};
  const rates = rules.rates || {};
  const entries = Object.entries(rates).filter(([, v]) => Number.isFinite(Number(v)));
  if (entries.length === 0) return String(value);

  const max = Math.max(...entries.map(([, v]) => Number(v)));
  const units = entries
    .map(([k, v]) => ({ unit: k, perMain: Number(v), factor: max / Number(v) }))
    .filter((x) => Number.isInteger(x.factor))
    .sort((a, b) => b.factor - a.factor);

  if (units.length === 0) return String(value);
  let remain = value;
  const parts = [];
  for (const u of units) {
    const count = Math.floor(remain / u.factor);
    remain = remain % u.factor;
    parts.push(`${count}${u.unit}`);
  }
  return parts.join(' ');
};

const afterAuth = (data) => {
  localStorage.setItem('market_token', data.accessToken);
  user.value = data.user;
  connectWs();
  fetchMyShops();
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

const register = async () => {
  loading.value = true;
  try {
    const res = await api.post('/auth/register', { ...registerForm });
    afterAuth(res.data);
    ElMessage.success('注册成功');
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
    fetchMyShops();
  } catch {
    localStorage.removeItem('market_token');
  }
};

const fetchMyShops = async () => {
  if (!user.value) return;
  try {
    const res = await api.get('/shops');
    myShops.value = res.data;

    if (!selectedCustomerShopId.value) {
      const last = Number(localStorage.getItem('market_last_customer_shop') || '');
      const pick = customerShops.value.find((s) => s.shopId === last) ?? customerShops.value[0];
      selectedCustomerShopId.value = pick?.shopId ?? null;
    }
    if (!selectedManagerShopId.value) {
      const last = Number(localStorage.getItem('market_last_manager_shop') || '');
      const pick = managerShops.value.find((s) => s.shopId === last) ?? managerShops.value[0];
      selectedManagerShopId.value = pick?.shopId ?? null;
    }
  } catch (err) {
    handleError(err);
  }
};

const joinShop = async () => {
  try {
    await api.post('/shops/join', { ...joinForm });
    ElMessage.success('加入成功');
    joinForm.inviteCode = '';
    if (!joinForm.charName) joinForm.charName = '';
    await fetchMyShops();
    topTab.value = 'customer';
  } catch (err) {
    handleError(err);
  }
};

const createShop = async () => {
  try {
    await api.post('/shops', { name: createShopForm.name });
    ElMessage.success('创建店铺成功');
    await fetchMyShops();
    topTab.value = 'manager';
  } catch (err) {
    handleError(err);
  }
};

const updateShopSettingsForm = reactive({ name: '', currencyRules: '' });

const loadManagerShopSettingsForm = () => {
  const shop = managerContext.summary?.shop;
  if (!shop) return;
  updateShopSettingsForm.name = shop.name || '';
  updateShopSettingsForm.currencyRules = JSON.stringify(shop.currencyRules || {}, null, 2);
};

const saveShopSettings = async () => {
  if (!selectedManagerShopId.value) return;
  try {
    const currencyRules = JSON.parse(updateShopSettingsForm.currencyRules || '{}');
    await api.patch(`/shops/${selectedManagerShopId.value}`, {
      name: updateShopSettingsForm.name,
      currencyRules,
    });
    ElMessage.success('店铺设置已保存');
    await refreshManager();
    loadManagerShopSettingsForm();
  } catch (err) {
    handleError(err);
  }
};

const createStall = async () => {
  if (!selectedManagerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    await api.post(`/shops/${selectedManagerShopId.value}/stalls`, {
      name: createStallForm.name,
      description: createStallForm.description,
    });
    ElMessage.success('创建摊位成功');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const createProduct = async () => {
  if (!createProductForm.stallId) return ElMessage.warning('请填写摊位ID');
  try {
    await api.post(`/shops/stalls/${Number(createProductForm.stallId)}/products`, {
      name: createProductForm.name,
      icon: createProductForm.icon,
      price: Number(createProductForm.price),
      stock: Number(createProductForm.stock),
      isLimitStock: createProductForm.isLimitStock,
    });
    ElMessage.success('新增商品成功');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const createWallet = async () => {
  if (!selectedManagerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    await api.post(`/shops/${selectedManagerShopId.value}/wallet-groups`, { name: createWalletForm.name });
    ElMessage.success('创建钱包组成功');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const assignWallet = async () => {
  if (!selectedManagerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    await api.post(`/shops/${selectedManagerShopId.value}/assign-wallet`, {
      memberId: Number(assignWalletForm.memberId),
      walletId: Number(assignWalletForm.walletId),
    });
    ElMessage.success('分配成功');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const grantBalance = async () => {
  if (!selectedManagerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    await api.post(`/shops/${selectedManagerShopId.value}/grant-balance`, {
      memberId: Number(grantForm.memberId),
      amount: Number(grantForm.amount),
      target: grantForm.target,
    });
    ElMessage.success('操作成功');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const purchase = async (productId, quantity) => {
  if (!selectedCustomerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    await api.post(`/shops/${selectedCustomerShopId.value}/purchase`, {
      productId: Number(productId),
      quantity: Number(quantity),
    });
    ElMessage.success('购买完成');
    await refreshCustomer();
  } catch (err) {
    handleError(err);
  }
};

const leaveShop = async () => {
  if (!selectedCustomerShopId.value) return;
  try {
    await ElMessageBox.confirm('确认退出该小店？', '提示', { type: 'warning' });
    await api.delete(`/shops/${selectedCustomerShopId.value}/leave`);
    ElMessage.success('已退出小店');
    selectedCustomerShopId.value = null;
    await fetchMyShops();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const refreshCustomer = async () => {
  const shopId = selectedCustomerShopId.value;
  if (!shopId) return;
  localStorage.setItem('market_last_customer_shop', String(shopId));
  subscribeShop(shopId);
  const [summary, stalls, members, inventory, logs] = await Promise.all([
    api.get(`/shops/${shopId}/summary`),
    api.get(`/shops/${shopId}/stalls`),
    api.get(`/shops/${shopId}/public-members`),
    api.get(`/shops/${shopId}/inventory`),
    api.get(`/shops/${shopId}/logs?limit=10`),
  ]);
  customerContext.summary = summary.data;
  customerContext.stalls = stalls.data;
  customerContext.members = members.data;
  customerContext.inventory = inventory.data;
  customerContext.logs = logs.data;
};

const refreshManager = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  localStorage.setItem('market_last_manager_shop', String(shopId));
  subscribeShop(shopId);
  const [summary, stalls, members, logs] = await Promise.all([
    api.get(`/shops/${shopId}/summary`),
    api.get(`/shops/${shopId}/stalls`),
    api.get(`/shops/${shopId}/members`),
    api.get(`/shops/${shopId}/logs?limit=50`),
  ]);
  managerContext.summary = summary.data;
  managerContext.stalls = stalls.data;
  managerContext.members = members.data;
  managerContext.logs = logs.data;
  // manager inventory page loads per selected member later
  loadManagerShopSettingsForm();

  if (!managerBagState.selectedMemberId && managerContext.members.length) {
    managerBagState.selectedMemberId = managerContext.members[0].id;
  }
};

const toggleStallActive = async (stall) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.patch(`/shops/${shopId}/stalls/${stall.id}`, { isActive: !stall.isActive });
    ElMessage.success('已更新摊位状态');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const toggleProductActive = async (product) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.patch(`/shops/${shopId}/products/${product.id}`, { isActive: !product.isActive });
    ElMessage.success('已更新商品状态');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const setMemberRole = async (memberId, role) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.post(`/shops/${shopId}/set-member-role`, { memberId, role });
    ElMessage.success('已更新身份');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const deleteShop = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await ElMessageBox.confirm('确认注销小店？这会删除所有数据（不可恢复）', '危险操作', { type: 'error' });
    await api.delete(`/shops/${shopId}`);
    ElMessage.success('小店已注销');
    selectedManagerShopId.value = null;
    await fetchMyShops();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const loadManagerInventory = async () => {
  const shopId = selectedManagerShopId.value;
  const memberId = managerBagState.selectedMemberId;
  if (!shopId || !memberId) return;
  try {
    const res = await api.get(`/shops/${shopId}/inventory?memberId=${memberId}`);
    managerBagState.inventory = res.data;
  } catch (err) {
    handleError(err);
  }
};

const adjustInventory = async () => {
  const shopId = selectedManagerShopId.value;
  const memberId = managerBagState.selectedMemberId;
  if (!shopId || !memberId) return;
  try {
    await api.post(`/shops/${shopId}/inventory/adjust`, {
      memberId,
      name: managerBagState.adjust.name,
      quantityDelta: Number(managerBagState.adjust.quantityDelta),
      icon: managerBagState.adjust.icon || undefined,
      extraDesc: managerBagState.adjust.extraDesc || undefined,
    });
    ElMessage.success('背包已更新');
    await loadManagerInventory();
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

watch(selectedCustomerShopId, () => {
  if (topTab.value === 'customer') refreshCustomer();
});
watch(selectedManagerShopId, () => {
  if (topTab.value === 'manager') refreshManager();
});
watch(topTab, () => {
  if (topTab.value === 'customer') refreshCustomer();
  if (topTab.value === 'manager') refreshManager();
});

watch(
  () => managerBagState.selectedMemberId,
  () => {
    if (topTab.value === 'manager' && managerTab.value === 'bag') loadManagerInventory();
  },
);

const adminConfig = ref(null);
const adminStats = ref(null);

const loadAdmin = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const [config, stats] = await Promise.all([api.get('/admin/config'), api.get('/admin/stats')]);
    adminConfig.value = config.data;
    adminStats.value = stats.data;
  } catch (err) {
    handleError(err);
  }
};

const accountForm = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
});

const loadAccountForm = () => {
  accountForm.username = user.value?.username || '';
  accountForm.currentPassword = '';
  accountForm.newPassword = '';
};

const saveUsername = async () => {
  try {
    const res = await api.patch('/account/username', { username: accountForm.username });
    user.value = res.data;
    ElMessage.success('用户名已更新');
  } catch (err) {
    handleError(err);
  }
};

const savePassword = async () => {
  try {
    await api.patch('/account/password', {
      currentPassword: accountForm.currentPassword,
      newPassword: accountForm.newPassword,
    });
    accountForm.currentPassword = '';
    accountForm.newPassword = '';
    ElMessage.success('密码已更新');
  } catch (err) {
    handleError(err);
  }
};

const connectWs = () => {
  if (ws) return;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}/ws`;
  wsStatus.value = 'connecting';
  ws = new WebSocket(url);
  ws.onopen = () => {
    wsStatus.value = 'connected';
    if (subscribedShopId) subscribeShop(subscribedShopId);
  };
  ws.onclose = () => {
    wsStatus.value = 'disconnected';
    ws = null;
    subscribedShopId = null;
    setTimeout(connectWs, 2000);
  };
  ws.onerror = () => {
    wsStatus.value = 'error';
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.shopId && (msg.type || '').includes('_')) {
        const current = topTab.value === 'manager' ? selectedManagerShopId.value : selectedCustomerShopId.value;
        if (Number(msg.shopId) === Number(current)) {
          // coarse refresh on relevant events
          if (topTab.value === 'manager') refreshManager();
          if (topTab.value === 'customer') refreshCustomer();
        }
      }
    } catch {
      // ignore
    }
  };
};

const subscribeShop = (shopId) => {
  subscribedShopId = shopId;
  if (!ws || ws.readyState !== 1) return;
  if (subscribedShopId !== shopId) return;
  if (subscribedShopId && subscribedShopId !== shopId) {
    ws.send(JSON.stringify({ type: 'unsubscribe', shopId: subscribedShopId }));
  }
  ws.send(JSON.stringify({ type: 'subscribe', shopId }));
};

const logout = () => {
  localStorage.removeItem('market_token');
  user.value = null;
  myShops.value = [];
  selectedCustomerShopId.value = null;
  selectedManagerShopId.value = null;
  adminConfig.value = null;
  adminStats.value = null;
  if (ws) ws.close();
  ws = null;
  wsStatus.value = 'disconnected';
};

onMounted(() => {
  fetchMe();
});

watch(isSuperAdmin, (v) => {
  if (!v && topTab.value === 'admin') topTab.value = 'stats';
});

watch(topTab, () => {
  if (topTab.value === 'account') loadAccountForm();
  if (topTab.value === 'admin') loadAdmin();
});
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
        <el-button size="small" @click="logout">退出</el-button>
      </div>
    </header>

    <div v-if="!user" class="auth-card">
      <el-card>
        <el-tabs v-model="authMode">
          <el-tab-pane label="登录" name="login">
            <el-alert
              title="超级管理员账号来自 config.toml；普通用户可注册（若服务器允许）"
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
          </el-tab-pane>
          <el-tab-pane label="注册" name="register">
            <el-form :model="registerForm" label-width="80px" class="auth-form">
              <el-form-item label="用户名">
                <el-input v-model="registerForm.username" placeholder="player1" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="registerForm.password" type="password" placeholder="至少6位" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="loading" @click="register">注册</el-button>
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </div>

    <div v-else class="app">
      <el-tabs v-model="topTab" type="border-card">
        <el-tab-pane label="统计" name="stats">
          <el-row :gutter="16">
            <el-col :xs="24" :md="8">
              <el-card>
                <template #header>概览</template>
                <div>我管理的小店：{{ stats.managed }}</div>
                <div>我加入的小店：{{ stats.joined }}</div>
              </el-card>
            </el-col>
            <el-col :xs="24" :md="8">
              <el-card>
                <template #header>加入小店</template>
                <el-form :model="joinForm" label-width="80px">
                  <el-form-item label="邀请码">
                    <el-input v-model="joinForm.inviteCode" />
                  </el-form-item>
                  <el-form-item label="角色名">
                    <el-input v-model="joinForm.charName" placeholder="PL角色名" />
                  </el-form-item>
                  <el-button type="primary" @click="joinShop">加入</el-button>
                </el-form>
              </el-card>
            </el-col>
            <el-col v-if="isSuperAdmin" :xs="24" :md="8">
              <el-card>
                <template #header>创建小店</template>
                <el-form :model="createShopForm" label-width="80px">
                  <el-form-item label="店名">
                    <el-input v-model="createShopForm.name" />
                  </el-form-item>
                  <el-button type="primary" @click="createShop">创建</el-button>
                </el-form>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="顾客" name="customer">
          <div class="layout">
            <aside class="sidebar">
              <div class="sidebar-title">已加入小店</div>
              <el-menu :default-active="String(selectedCustomerShopId || '')" @select="(k) => (selectedCustomerShopId = Number(k))">
                <el-menu-item v-for="s in customerShops" :key="s.shopId" :index="String(s.shopId)">
                  <span>{{ s.shop.name }}</span>
                </el-menu-item>
              </el-menu>
            </aside>

            <main class="content">
              <div v-if="!selectedCustomerShopId">暂无小店，请先在“统计”页用邀请码加入。</div>
              <div v-else>
                <el-tabs v-model="customerTab">
                  <el-tab-pane label="小店主页" name="home">
                    <div class="flex">
                      <div>
                        <strong>{{ customerContext.summary?.shop?.name }}</strong>
                        <span class="meta">邀请码 {{ customerContext.summary?.shop?.inviteCode }}</span>
                      </div>
                      <el-button type="danger" plain @click="leaveShop">退出小店</el-button>
                    </div>
                    <el-table :data="customerContext.members" size="small" style="width: 100%; margin-top: 8px">
                      <el-table-column prop="charName" label="角色" />
                      <el-table-column prop="role" label="身份" width="120" />
                    </el-table>
                  </el-tab-pane>

                  <el-tab-pane label="商店" name="store">
                    <div v-for="stall in customerContext.stalls" :key="stall.id" class="stall">
                      <div class="stall-title">
                        <strong>{{ stall.name }}</strong>
                        <span class="meta">ID {{ stall.id }}</span>
                      </div>
                      <el-table :data="stall.products" size="small" style="width: 100%">
                        <el-table-column prop="id" label="ID" width="70" />
                        <el-table-column label="图标" width="70">
                          <template #default="{ row }">
                            <span v-if="row.icon && row.icon.startsWith('http')"><img :src="row.icon" class="icon" /></span>
                            <span v-else>{{ row.icon || '🧩' }}</span>
                          </template>
                        </el-table-column>
                        <el-table-column prop="name" label="名称" />
                        <el-table-column prop="price" label="价格" width="90" />
                        <el-table-column prop="stock" label="库存" width="80" />
                        <el-table-column label="购买" width="180">
                          <template #default="{ row }">
                            <el-input-number :min="1" :max="99" v-model="row.__qty" size="small" />
                            <el-button size="small" type="primary" @click="purchase(row.id, row.__qty || 1)">买</el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="钱包/背包" name="bag">
                    <el-card>
                      <div>
                        个人余额：
                        {{ formatBalance(customerContext.summary?.member?.balanceRaw ?? 0, customerContext.summary?.shop?.currencyRules) }}
                      </div>
                      <div>
                        钱包组：
                        <span v-if="customerContext.summary?.wallet">
                          {{ customerContext.summary.wallet.name }}（余额
                          {{ formatBalance(customerContext.summary.wallet.balanceRaw, customerContext.summary?.shop?.currencyRules) }}）
                        </span>
                        <span v-else class="meta">未加入</span>
                      </div>
                    </el-card>
                    <el-table :data="customerContext.inventory" size="small" style="width: 100%; margin-top: 12px">
                      <el-table-column prop="icon" label="图标" width="70" />
                      <el-table-column prop="name" label="物品" />
                      <el-table-column prop="quantity" label="数量" width="80" />
                    </el-table>
                  </el-tab-pane>

                  <el-tab-pane label="日志" name="logs">
                    <el-table :data="customerContext.logs" size="small" style="width: 100%">
                      <el-table-column prop="createdAt" label="时间" width="190" />
                      <el-table-column prop="type" label="类型" width="140" />
                      <el-table-column prop="content" label="内容" />
                      <el-table-column prop="amount" label="金额" width="90" />
                    </el-table>
                  </el-tab-pane>
                </el-tabs>
              </div>
            </main>
          </div>
        </el-tab-pane>

        <el-tab-pane label="店长" name="manager">
          <div class="layout">
            <aside class="sidebar">
              <div class="sidebar-title">管理的小店</div>
              <el-menu :default-active="String(selectedManagerShopId || '')" @select="(k) => (selectedManagerShopId = Number(k))">
                <el-menu-item v-for="s in managerShops" :key="s.shopId" :index="String(s.shopId)">
                  <span>{{ s.shop.name }}</span>
                </el-menu-item>
              </el-menu>
            </aside>

            <main class="content">
              <div v-if="!selectedManagerShopId">暂无可管理小店。</div>
              <div v-else>
                <el-tabs v-model="managerTab">
                  <el-tab-pane label="小店主页" name="home">
                    <div class="flex">
                      <div>
                        <strong>{{ managerContext.summary?.shop?.name }}</strong>
                        <span class="meta">邀请码 {{ managerContext.summary?.shop?.inviteCode }}</span>
                      </div>
                      <el-button
                        v-if="managerContext.summary?.member?.role === 'OWNER'"
                        type="danger"
                        plain
                        @click="deleteShop"
                      >
                        注销小店
                      </el-button>
                    </div>

                    <el-divider />
                    <el-card style="margin-bottom: 12px">
                      <template #header>店铺设置</template>
                      <el-form :model="updateShopSettingsForm" label-width="90px">
                        <el-form-item label="店名">
                          <el-input v-model="updateShopSettingsForm.name" />
                        </el-form-item>
                        <el-form-item label="货币规则">
                          <el-input
                            type="textarea"
                            v-model="updateShopSettingsForm.currencyRules"
                            rows="5"
                            placeholder='{ "main": "金", "rates": { "金": 1, "银": 10, "铜": 100 } }'
                          />
                        </el-form-item>
                        <el-button type="primary" @click="saveShopSettings">保存设置</el-button>
                      </el-form>
                    </el-card>

                    <el-row :gutter="16">
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>钱包组</template>
                          <el-form :model="createWalletForm" label-width="70px">
                            <el-form-item label="名称">
                              <el-input v-model="createWalletForm.name" />
                            </el-form-item>
                            <el-button type="primary" @click="createWallet">创建</el-button>
                          </el-form>
                          <div style="margin-top: 8px">
                            <div v-for="w in managerContext.summary?.wallets || []" :key="w.id" class="meta">
                              {{ w.name }}（ID {{ w.id }}，余额 {{ w.balanceRaw }}）
                            </div>
                          </div>
                        </el-card>
                      </el-col>
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>分配顾客钱包组</template>
                          <el-form :model="assignWalletForm" label-width="70px">
                            <el-form-item label="顾客">
                              <el-select v-model="assignWalletForm.memberId" style="width: 100%">
                                <el-option
                                  v-for="m in managerContext.members.filter((x) => x.role === 'CUSTOMER')"
                                  :key="m.id"
                                  :label="m.charName"
                                  :value="m.id"
                                />
                              </el-select>
                            </el-form-item>
                            <el-form-item label="钱包ID">
                              <el-input v-model="assignWalletForm.walletId" />
                            </el-form-item>
                            <el-button type="primary" @click="assignWallet">分配</el-button>
                          </el-form>
                        </el-card>
                      </el-col>
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>加减余额</template>
                          <el-form :model="grantForm" label-width="70px">
                            <el-form-item label="成员">
                              <el-select v-model="grantForm.memberId" style="width: 100%">
                                <el-option
                                  v-for="m in managerContext.members"
                                  :key="m.id"
                                  :label="`${m.charName} (${m.role})`"
                                  :value="m.id"
                                />
                              </el-select>
                            </el-form-item>
                            <el-form-item label="金额">
                              <el-input v-model="grantForm.amount" />
                            </el-form-item>
                            <el-form-item label="目标">
                              <el-select v-model="grantForm.target">
                                <el-option label="个人" value="personal" />
                                <el-option label="钱包组" value="wallet" />
                              </el-select>
                            </el-form-item>
                            <el-button type="success" @click="grantBalance">执行</el-button>
                          </el-form>
                        </el-card>
                      </el-col>
                    </el-row>

                    <el-divider />
                    <el-table :data="managerContext.members" size="small" style="width: 100%">
                      <el-table-column prop="charName" label="角色" />
                      <el-table-column prop="role" label="身份" width="120" />
                      <el-table-column prop="balanceRaw" label="个人余额" width="120" />
                      <el-table-column prop="walletId" label="钱包组" width="120" />
                      <el-table-column label="设为店员" width="160">
                        <template #default="{ row }">
                          <el-select
                            v-if="managerContext.summary?.member?.role === 'OWNER' && row.role !== 'OWNER'"
                            size="small"
                            :model-value="row.role"
                            @update:model-value="(v) => setMemberRole(row.id, v)"
                          >
                            <el-option label="顾客" value="CUSTOMER" />
                            <el-option label="店员" value="CLERK" />
                          </el-select>
                          <span v-else class="meta">-</span>
                        </template>
                      </el-table-column>
                    </el-table>
                  </el-tab-pane>

                  <el-tab-pane label="商店" name="store">
                    <el-row :gutter="16">
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>新增摊位</template>
                          <el-form :model="createStallForm" label-width="70px">
                            <el-form-item label="名称">
                              <el-input v-model="createStallForm.name" />
                            </el-form-item>
                            <el-form-item label="描述">
                              <el-input v-model="createStallForm.description" />
                            </el-form-item>
                            <el-button type="primary" @click="createStall">创建</el-button>
                          </el-form>
                        </el-card>
                      </el-col>
                      <el-col :xs="24" :md="16">
                        <el-card>
                          <template #header>新增商品</template>
                          <el-form :model="createProductForm" label-width="90px">
                            <el-form-item label="摊位ID">
                              <el-input v-model="createProductForm.stallId" />
                            </el-form-item>
                            <el-form-item label="名称">
                              <el-input v-model="createProductForm.name" />
                            </el-form-item>
                            <el-form-item label="价格">
                              <el-input v-model="createProductForm.price" />
                            </el-form-item>
                            <el-form-item label="库存">
                              <el-input v-model="createProductForm.stock" />
                            </el-form-item>
                            <el-form-item label="图标">
                              <el-input v-model="createProductForm.icon" />
                            </el-form-item>
                            <el-form-item label="限库存">
                              <el-switch v-model="createProductForm.isLimitStock" />
                            </el-form-item>
                            <el-button type="primary" @click="createProduct">创建</el-button>
                          </el-form>
                        </el-card>
                      </el-col>
                    </el-row>

                    <el-divider />
                    <div v-for="stall in managerContext.stalls" :key="stall.id" class="stall">
                      <div class="stall-title">
                        <strong>{{ stall.name }}</strong>
                        <span class="meta">ID {{ stall.id }}</span>
                        <el-button size="small" plain @click="toggleStallActive(stall)">
                          {{ stall.isActive ? '隐藏摊位' : '启用摊位' }}
                        </el-button>
                      </div>
                      <el-table :data="stall.products" size="small" style="width: 100%">
                        <el-table-column prop="id" label="ID" width="70" />
                        <el-table-column prop="name" label="名称" />
                        <el-table-column prop="price" label="价格" width="90" />
                        <el-table-column prop="stock" label="库存" width="80" />
                        <el-table-column label="状态" width="120">
                          <template #default="{ row }">
                            <el-button size="small" plain @click="toggleProductActive(row)">
                              {{ row.isActive ? '下架' : '上架' }}
                            </el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </el-tab-pane>

                  <el-tab-pane label="钱包/背包" name="bag">
                    <el-row :gutter="16">
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>选择顾客</template>
                          <el-select v-model="managerBagState.selectedMemberId" style="width: 100%" @change="loadManagerInventory">
                            <el-option
                              v-for="m in managerContext.members"
                              :key="m.id"
                              :label="`${m.charName} (${m.role})`"
                              :value="m.id"
                            />
                          </el-select>
                          <el-divider />
                          <el-form :model="managerBagState.adjust" label-width="80px">
                            <el-form-item label="物品名">
                              <el-input v-model="managerBagState.adjust.name" />
                            </el-form-item>
                            <el-form-item label="数量变更">
                              <el-input v-model="managerBagState.adjust.quantityDelta" />
                            </el-form-item>
                            <el-form-item label="图标">
                              <el-input v-model="managerBagState.adjust.icon" />
                            </el-form-item>
                            <el-form-item label="备注">
                              <el-input v-model="managerBagState.adjust.extraDesc" />
                            </el-form-item>
                            <el-button type="primary" @click="adjustInventory">更新背包</el-button>
                          </el-form>
                        </el-card>
                      </el-col>
                      <el-col :xs="24" :md="16">
                        <el-card>
                          <template #header>背包内容</template>
                          <el-table :data="managerBagState.inventory" size="small" style="width: 100%">
                            <el-table-column prop="icon" label="图标" width="70" />
                            <el-table-column prop="name" label="物品" />
                            <el-table-column prop="quantity" label="数量" width="80" />
                          </el-table>
                        </el-card>
                      </el-col>
                    </el-row>
                  </el-tab-pane>

                  <el-tab-pane label="日志" name="logs">
                    <el-table :data="managerContext.logs" size="small" style="width: 100%">
                      <el-table-column prop="createdAt" label="时间" width="190" />
                      <el-table-column prop="type" label="类型" width="160" />
                      <el-table-column prop="content" label="内容" />
                      <el-table-column prop="amount" label="金额" width="90" />
                    </el-table>
                  </el-tab-pane>
                </el-tabs>
              </div>
            </main>
          </div>
        </el-tab-pane>

        <el-tab-pane label="账号设置" name="account">
          <el-card>
            <el-form :model="accountForm" label-width="110px" style="max-width: 520px">
              <el-form-item label="用户名">
                <el-input v-model="accountForm.username" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveUsername">保存用户名</el-button>
              </el-form-item>
              <el-divider />
              <el-form-item label="当前密码">
                <el-input v-model="accountForm.currentPassword" type="password" show-password />
              </el-form-item>
              <el-form-item label="新密码">
                <el-input v-model="accountForm.newPassword" type="password" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="savePassword">修改密码</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-tab-pane>

        <el-tab-pane v-if="isSuperAdmin" label="超管设置" name="admin">
          <el-card>
            <template #header>超管设置（只读）</template>
            <div v-if="!adminConfig" class="meta">加载中...</div>
            <div v-else>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="超管用户名">{{ adminConfig.super_admin.username }}</el-descriptions-item>
                <el-descriptions-item label="允许注册">{{ adminConfig.features.allowRegister }}</el-descriptions-item>
                <el-descriptions-item label="WS ping(ms)">{{ adminConfig.ws.pingIntervalMs }}</el-descriptions-item>
                <el-descriptions-item label="WS timeout(ms)">{{ adminConfig.ws.clientTimeoutMs }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="adminStats" class="meta" style="margin-top: 12px">
                users={{ adminStats.users }} shops={{ adminStats.shops }} activeMembers={{ adminStats.activeMembers }}
              </div>
              <div class="meta" style="margin-top: 12px">{{ adminConfig.note }}</div>
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
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

.app {
  width: 100%;
}

.flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  min-height: 520px;
}

.sidebar {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
  overflow: auto;
}

.meta {
  color: #888;
  font-size: 12px;
}

.sidebar-title {
  font-weight: 600;
  margin: 4px 6px 8px;
}

.content {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  overflow: auto;
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

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
