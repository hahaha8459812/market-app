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

const customerSidebarCollapsed = ref(false);
const managerSidebarCollapsed = ref(false);

const selectedCustomerStall = computed(() => {
  const stalls = customerContext.stalls || [];
  const stallId = customerStoreState.stallId ? Number(customerStoreState.stallId) : null;
  return stallId ? stalls.find((s) => s.id === stallId) ?? null : (stalls[0] ?? null);
});

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

const inviteState = reactive({
  invites: [],
  ttlMinutes: 10,
});

const customerAdjustState = reactive({
  amount: 0,
  currencyId: null,
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


const grantForm = reactive({ memberId: null, amount: 0, currencyId: null, sign: 1, target: 'personal' });

const currencyCreateForm = reactive({ name: '' });

const customerStoreState = reactive({
  stallId: null,
});

const managerStoreState = reactive({
  stallId: null,
});

const selectedManagerStall = computed(() => {
  const stalls = managerContext.stalls || [];
  const stallId = managerStoreState.stallId ? Number(managerStoreState.stallId) : null;
  return stallId ? stalls.find((s) => s.id === stallId) ?? null : (stalls[0] ?? null);
});

const customerProductDialog = reactive({
  visible: false,
  product: null,
  qty: 1,
});

const managerProductDialog = reactive({
  visible: false,
  mode: 'edit', // edit | add
  stallId: null,
  productId: null,
  form: {
    name: '',
    icon: '',
    priceState: 'UNPRICED',
    priceAmount: 0,
    priceCurrencyId: null,
    stock: 0,
    isLimitStock: true,
    isActive: true,
    description: '',
  },
});

const managerStallDialog = reactive({
  visible: false,
  form: {
    name: '',
    description: '',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('market_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (err) => {
  const msg = err?.response?.data?.message || err.message || '请求失败';
  ElMessage.error(msg);
};

const currencyName = (currencies, currencyId) => {
  const id = Number(currencyId);
  const c = (currencies || []).find((x) => Number(x.id) === id);
  return c?.name || `币种#${id}`;
};

const formatMoney = (amount, currencyId, currencies) => {
  return `${Number(amount || 0)} ${currencyName(currencies, currencyId)}`;
};

const afterAuth = (data) => {
  localStorage.setItem('market_token', data.accessToken);
  user.value = data.user;
  connectWs();
  if (data.user.role === 'SUPER_ADMIN') {
    loadAdmin();
  } else {
    fetchMyShops();
  }
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
    if (res.data.role === 'SUPER_ADMIN') {
      loadAdmin();
    } else {
      fetchMyShops();
    }
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

const updateShopSettingsForm = reactive({ name: '' });

const loadManagerShopSettingsForm = () => {
  const shop = managerContext.summary?.shop;
  if (!shop) return;
  updateShopSettingsForm.name = shop.name || '';
};

const saveShopSettings = async () => {
  if (!selectedManagerShopId.value) return;
  try {
    await api.patch(`/shops/${selectedManagerShopId.value}`, {
      name: updateShopSettingsForm.name,
    });
    ElMessage.success('店铺设置已保存');
    await refreshManager();
    loadManagerShopSettingsForm();
  } catch (err) {
    handleError(err);
  }
};

const createCurrency = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  const name = String(currencyCreateForm.name || '').trim();
  if (!name) return ElMessage.warning('请输入币种名');
  try {
    await api.post(`/shops/${shopId}/currencies`, { name });
    currencyCreateForm.name = '';
    ElMessage.success('币种已创建');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const renameCurrency = async (currency) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    const { value } = await ElMessageBox.prompt('输入新的币种名称', '币种改名', {
      inputValue: currency.name,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
    const name = String(value || '').trim();
    if (!name) return;
    await api.patch(`/shops/${shopId}/currencies/${currency.id}`, { name });
    ElMessage.success('已改名');
    await refreshManager();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const deleteCurrency = async (currency) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await ElMessageBox.confirm(
      `确认删除币种「${currency.name}」？会清零该币种的队伍/个人余额，并让相关商品变为“无标价”。`,
      '危险操作',
      { type: 'warning' },
    );
    await api.request({
      method: 'delete',
      url: `/shops/${shopId}/currencies/${currency.id}`,
      data: { confirm: true },
    });
    ElMessage.success('币种已删除');
    await refreshManager();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const openAddStall = () => {
  managerStallDialog.form.name = '';
  managerStallDialog.form.description = '';
  managerStallDialog.visible = true;
};

const saveManagerStall = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    const name = String(managerStallDialog.form.name || '').trim();
    const description = String(managerStallDialog.form.description || '').trim();
    if (!name) return ElMessage.warning('请输入摊位名称');
    await api.post(`/shops/${shopId}/stalls`, { name, description: description || undefined });
    ElMessage.success('摊位已创建');
    managerStallDialog.visible = false;
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const grantBalance = async () => {
  if (!selectedManagerShopId.value) return ElMessage.warning('请先选择小店');
  try {
    if (!grantForm.currencyId) return ElMessage.warning('请选择币种');
    const raw = Number(grantForm.sign || 1) * Math.floor(Math.abs(Number(grantForm.amount) || 0));
    if (!raw) return ElMessage.warning('请输入金额');
    await api.post(`/shops/${selectedManagerShopId.value}/grant-balance`, {
      memberId: grantForm.target === 'personal' ? Number(grantForm.memberId) : undefined,
      currencyId: Number(grantForm.currencyId),
      amount: raw,
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
    customerProductDialog.visible = false;
    await refreshCustomer();
  } catch (err) {
    handleError(err);
  }
};

const openCustomerProduct = (p) => {
  customerProductDialog.product = p;
  customerProductDialog.qty = 1;
  customerProductDialog.visible = true;
};

const openManagerEditProduct = (stallId, p) => {
  managerProductDialog.mode = 'edit';
  managerProductDialog.stallId = Number(stallId);
  managerProductDialog.productId = Number(p.id);
  managerProductDialog.form = {
    name: p.name || '',
    icon: p.icon || '',
    priceState: p.priceState || 'UNPRICED',
    priceAmount: Number(p.priceAmount || 0),
    priceCurrencyId: p.priceCurrencyId || null,
    stock: Number(p.stock || 0),
    isLimitStock: !!p.isLimitStock,
    isActive: !!p.isActive,
    description: p.description || '',
  };
  managerProductDialog.visible = true;
};

const openManagerAddProduct = (stallId) => {
  managerProductDialog.mode = 'add';
  managerProductDialog.stallId = Number(stallId);
  managerProductDialog.productId = null;
  managerProductDialog.form = {
    name: '',
    icon: '',
    priceState: 'UNPRICED',
    priceAmount: 0,
    priceCurrencyId: null,
    stock: 0,
    isLimitStock: true,
    isActive: true,
    description: '',
  };
  managerProductDialog.visible = true;
};

const saveManagerProduct = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  const stallId = Number(managerProductDialog.stallId);
  if (!stallId) return ElMessage.warning('未选择摊位');
  try {
    const payload = {
      name: String(managerProductDialog.form.name || '').trim(),
      icon: managerProductDialog.form.icon || undefined,
      priceState: managerProductDialog.form.priceState,
      priceAmount: managerProductDialog.form.priceState === 'PRICED' ? Number(managerProductDialog.form.priceAmount || 0) : undefined,
      priceCurrencyId: managerProductDialog.form.priceState === 'PRICED' ? Number(managerProductDialog.form.priceCurrencyId) : undefined,
      stock: Number(managerProductDialog.form.stock || 0),
      isLimitStock: !!managerProductDialog.form.isLimitStock,
      isActive: !!managerProductDialog.form.isActive,
      description: String(managerProductDialog.form.description || '').trim() || undefined,
    };
    if (!payload.name) return ElMessage.warning('请输入商品名称');
    if (payload.priceState === 'PRICED') {
      if (!Number.isFinite(payload.priceAmount) || payload.priceAmount < 0) return ElMessage.warning('价格不合法');
      if (!payload.priceCurrencyId) return ElMessage.warning('请选择币种');
    }
    if (!Number.isFinite(payload.stock) || payload.stock < 0) return ElMessage.warning('库存不合法');

    if (managerProductDialog.mode === 'add') {
      await api.post(`/shops/stalls/${stallId}/products`, payload);
      ElMessage.success('商品已添加');
    } else {
      await api.patch(`/shops/${shopId}/products/${Number(managerProductDialog.productId)}`, payload);
      ElMessage.success('商品已保存');
    }
    managerProductDialog.visible = false;
    await refreshManager();
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

  const ids = new Set((customerContext.stalls || []).map((s) => String(s.id)));
  if (!customerStoreState.stallId || !ids.has(String(customerStoreState.stallId))) {
    customerStoreState.stallId = customerContext.stalls?.length ? String(customerContext.stalls[0].id) : null;
  }

  const active = (customerContext.summary?.currencies || []).filter((c) => c.isActive);
  if (!customerAdjustState.currencyId && active.length) customerAdjustState.currencyId = active[0].id;
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

  const active = (managerContext.summary?.currencies || []).filter((c) => c.isActive);
  if (!grantForm.currencyId && active.length) grantForm.currencyId = active[0].id;

  if (!managerBagState.selectedMemberId) {
    const firstCustomer = managerContext.members.find((m) => m.role === 'CUSTOMER');
    managerBagState.selectedMemberId = firstCustomer ? firstCustomer.id : null;
  }

  const stallIds = new Set((managerContext.stalls || []).map((s) => String(s.id)));
  if (!managerStoreState.stallId || !stallIds.has(String(managerStoreState.stallId))) {
    managerStoreState.stallId = managerContext.stalls?.length ? String(managerContext.stalls[0].id) : null;
  }

  try {
    const invites = await api.get(`/shops/${shopId}/invites`);
    inviteState.invites = invites.data;
  } catch {
    inviteState.invites = [];
  }
};

const createInvite = async () => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.post(`/shops/${shopId}/invites`, { ttlMinutes: Number(inviteState.ttlMinutes) });
    ElMessage.success('邀请码已创建（10分钟内有效）');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const deleteInvite = async (inviteId) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.delete(`/shops/${shopId}/invites/${inviteId}`);
    ElMessage.success('邀请码已删除');
    await refreshManager();
  } catch (err) {
    handleError(err);
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

const setCustomerAdjustSwitches = async (allowCustomerInc, allowCustomerDec) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    await api.patch(`/shops/${shopId}/customer-adjust`, { allowCustomerInc, allowCustomerDec });
    ElMessage.success('已更新顾客自助开关');
    await refreshManager();
  } catch (err) {
    handleError(err);
  }
};

const switchWalletMode = async (mode) => {
  const shopId = selectedManagerShopId.value;
  if (!shopId) return;
  try {
    const label = mode === 'TEAM' ? 'PERSONAL → TEAM（合并所有顾客余额）' : 'TEAM → PERSONAL（均摊到所有顾客，余数给ID最大顾客）';
    await ElMessageBox.confirm(`确认切换钱包模式：${label}？`, '提示', { type: 'warning' });
    await api.post(`/shops/${shopId}/wallet-mode`, { mode });
    ElMessage.success('钱包模式已切换');
    await refreshManager();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const selfAdjustBalance = async (payload) => {
  const shopId = selectedCustomerShopId.value;
  if (!shopId) return;
  try {
    await api.post(`/shops/${shopId}/self-adjust`, { currencyId: Number(payload.currencyId), amount: Number(payload.amount) });
    ElMessage.success('已调整余额');
    customerAdjustState.amount = 0;
    await refreshCustomer();
  } catch (err) {
    handleError(err);
  }
};

const selfAdjustBalanceSigned = async (sign) => {
  if (!customerAdjustState.currencyId) return ElMessage.warning('请选择币种');
  const abs = Math.floor(Math.abs(Number(customerAdjustState.amount) || 0));
  if (!abs) return ElMessage.warning('请输入金额');
  return selfAdjustBalance({ currencyId: Number(customerAdjustState.currencyId), amount: sign * abs });
};

watch(selectedCustomerShopId, () => {
  customerStoreState.stallId = null;
  if (topTab.value === 'customer') refreshCustomer();
});
watch(selectedManagerShopId, () => {
  managerStoreState.stallId = null;
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
const adminUsers = ref([]);
const adminSelectedUserId = ref(null);
const adminSelectedUserDetail = ref(null);

const adminConfigForm = reactive({
  allow_register: true,
  ws_ping_interval_ms: 25000,
});

const adminCreateUserForm = reactive({
  username: '',
  password: '',
});

const loadAdmin = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const [config, stats, users] = await Promise.all([
      api.get('/admin/config'),
      api.get('/admin/stats'),
      api.get('/admin/users'),
    ]);
    adminConfig.value = config.data;
    adminStats.value = stats.data;
    adminUsers.value = users.data;
    adminConfigForm.allow_register = !!config.data.features.allowRegister;
    adminConfigForm.ws_ping_interval_ms = Number(config.data.ws.pingIntervalMs || 25000);
  } catch (err) {
    handleError(err);
  }
};

const loadAdminUserDetail = async (id) => {
  if (!id) return;
  try {
    const res = await api.get(`/admin/users/${id}`);
    adminSelectedUserDetail.value = res.data;
  } catch (err) {
    handleError(err);
  }
};

const createManagedUser = async () => {
  try {
    await api.post('/admin/users', { ...adminCreateUserForm });
    ElMessage.success('账号已创建');
    adminCreateUserForm.username = '';
    adminCreateUserForm.password = '';
    await loadAdmin();
  } catch (err) {
    handleError(err);
  }
};

const deleteManagedUser = async (id) => {
  try {
    await ElMessageBox.confirm('确认删除该账号？会删除其店铺/成员数据（不可恢复）', '危险操作', { type: 'error' });
    await api.delete(`/admin/users/${id}`);
    ElMessage.success('账号已删除');
    adminSelectedUserId.value = null;
    adminSelectedUserDetail.value = null;
    await loadAdmin();
  } catch (err) {
    if (err !== 'cancel') handleError(err);
  }
};

const saveAdminConfig = async () => {
  try {
    await api.patch('/admin/config', {
      allow_register: adminConfigForm.allow_register,
      ws_ping_interval_ms: Number(adminConfigForm.ws_ping_interval_ms),
    });
    ElMessage.success('已写入 config.toml（需重启容器生效）');
    await loadAdmin();
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
      <div v-if="isSuperAdmin">
        <el-row :gutter="16">
          <el-col :xs="24" :md="10">
            <el-card>
              <template #header>平台账号管理</template>
              <el-form :model="adminCreateUserForm" label-width="80px">
                <el-form-item label="用户名">
                  <el-input v-model="adminCreateUserForm.username" />
                </el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="adminCreateUserForm.password" type="password" show-password />
                </el-form-item>
                <el-button type="primary" @click="createManagedUser">创建账号</el-button>
                <el-button plain @click="loadAdmin">刷新</el-button>
              </el-form>
              <el-divider />
              <el-table :data="adminUsers" size="small" style="width: 100%" @row-click="(row) => (adminSelectedUserId = row.id)">
                <el-table-column prop="id" label="ID" width="70" />
                <el-table-column prop="username" label="用户名" />
                <el-table-column prop="createdAt" label="创建时间" width="190" />
              </el-table>
            </el-card>
          </el-col>

          <el-col :xs="24" :md="14">
            <el-card style="margin-bottom: 16px">
              <template #header>配置（写入 config.toml）</template>
              <el-form :model="adminConfigForm" label-width="140px" style="max-width: 520px">
                <el-form-item label="允许注册">
                  <el-switch v-model="adminConfigForm.allow_register" />
                </el-form-item>
                <el-form-item label="WS ping(ms)">
                  <el-input v-model="adminConfigForm.ws_ping_interval_ms" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="saveAdminConfig">保存配置</el-button>
                  <span class="meta" style="margin-left: 8px">保存后需重启容器生效</span>
                </el-form-item>
              </el-form>
              <div v-if="adminStats" class="meta">
                users={{ adminStats.users }} shops={{ adminStats.shops }} activeMembers={{ adminStats.activeMembers }}
              </div>
            </el-card>

            <el-card>
              <template #header>账号详情</template>
              <div v-if="!adminSelectedUserId" class="meta">点左侧账号查看详情</div>
              <div v-else>
                <el-button type="danger" plain @click="deleteManagedUser(adminSelectedUserId)">删除该账号</el-button>
                <el-button plain @click="loadAdminUserDetail(adminSelectedUserId)">刷新详情</el-button>
                <el-divider />
                <div v-if="!adminSelectedUserDetail" class="meta">加载中...</div>
                <div v-else>
                  <div><strong>{{ adminSelectedUserDetail.user.username }}</strong>（ID {{ adminSelectedUserDetail.user.id }}）</div>
                  <el-divider />
                  <div><strong>店长/店员小店</strong></div>
                  <div v-if="adminSelectedUserDetail.asOwner.length === 0" class="meta">无</div>
                  <ul v-else>
                    <li v-for="s in adminSelectedUserDetail.asOwner" :key="s.shopId">{{ s.shopName }}（{{ s.role }}）</li>
                  </ul>
                  <el-divider />
                  <div><strong>顾客小店</strong></div>
                  <div v-if="adminSelectedUserDetail.asCustomer.length === 0" class="meta">无</div>
                  <ul v-else>
                    <li v-for="s in adminSelectedUserDetail.asCustomer" :key="s.shopId">{{ s.shopName }}（{{ s.role }}）</li>
                  </ul>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <el-tabs v-else v-model="topTab" type="border-card">
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
            <el-col :xs="24" :md="8">
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
          <div class="layout" :class="{ 'sidebar-collapsed': customerSidebarCollapsed }">
            <aside class="sidebar">
              <div class="flex" style="justify-content: flex-start; gap: 8px">
                <div class="sidebar-title">已加入小店</div>
                <el-button size="small" plain @click="customerSidebarCollapsed = !customerSidebarCollapsed">
                  {{ customerSidebarCollapsed ? '展开' : '折叠' }}
                </el-button>
              </div>
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
                      </div>
                      <el-button type="danger" plain @click="leaveShop">退出小店</el-button>
                    </div>
                    <el-table :data="customerContext.members" size="small" style="width: 100%; margin-top: 8px">
                      <el-table-column prop="charName" label="角色" />
                      <el-table-column prop="role" label="身份" width="120" />
                    </el-table>
                  </el-tab-pane>

                  <el-tab-pane label="商店" name="store">
                    <div v-if="!customerContext.stalls.length" class="meta">暂无摊位。</div>
                    <div v-else class="store-layout">
                      <aside class="stall-list">
                        <div class="sidebar-title">摊位</div>
                        <el-collapse accordion v-model="customerStoreState.stallId">
                          <el-collapse-item v-for="stall in customerContext.stalls" :key="stall.id" :name="String(stall.id)">
                            <template #title>
                              <div class="flex" style="width: 100%; gap: 8px">
                                <span>{{ stall.name }}</span>
                                <span class="meta">（{{ (stall.products || []).length }}）</span>
                              </div>
                            </template>
                            <div class="meta">{{ stall.description || '无描述' }}</div>
                          </el-collapse-item>
                        </el-collapse>
                      </aside>

                      <div class="product-area">
                        <div class="flex" style="margin-bottom: 8px">
                          <strong>{{ selectedCustomerStall?.name || '未选择摊位' }}</strong>
                          <span class="meta" v-if="selectedCustomerStall">ID {{ selectedCustomerStall.id }}</span>
                        </div>

                        <el-row :gutter="12">
                          <el-col
                            v-for="p in (selectedCustomerStall?.products || [])"
                            :key="p.id"
                            :xs="12"
                            :sm="8"
                            :md="6"
                            :lg="6"
                          >
                          <el-card class="product-card clickable" shadow="hover" @click="openCustomerProduct(p)">
                            <div class="product-header">
                              <span v-if="p.icon && p.icon.startsWith('http')"><img :src="p.icon" class="icon" /></span>
                              <span v-else class="product-emoji">{{ p.icon || '🧩' }}</span>
                              <div class="product-title">
                                <div class="product-name">{{ p.name }}</div>
                                  <div class="meta">
                                    <span v-if="p.priceState === 'PRICED'">
                                      价格 {{ formatMoney(p.priceAmount, p.priceCurrencyId, customerContext.summary?.currencies) }}
                                    </span>
                                    <span v-else>无标价</span>
                                    <span v-if="p.isLimitStock">｜库存 {{ p.stock }}</span>
                                  </div>
                                </div>
                              </div>
                            </el-card>
                        </el-col>
                      </el-row>

                        <div v-if="selectedCustomerStall && !(selectedCustomerStall.products || []).length" class="meta">
                          该摊位暂无商品。
                        </div>
                      </div>
                    </div>

                    <el-dialog v-model="customerProductDialog.visible" width="520px" :show-close="false">
                      <template #header>
                        <div class="flex" style="width: 100%">
                          <strong>{{ customerProductDialog.product?.name || '商品' }}</strong>
                          <el-button text @click="customerProductDialog.visible = false">✕</el-button>
                        </div>
                      </template>
                      <div v-if="customerProductDialog.product">
                        <div class="product-detail">
                          <div class="product-detail-icon">
                            <img
                              v-if="customerProductDialog.product.icon && customerProductDialog.product.icon.startsWith('http')"
                              :src="customerProductDialog.product.icon"
                              class="product-detail-img"
                            />
                            <div v-else class="product-detail-emoji">{{ customerProductDialog.product.icon || '🧩' }}</div>
                          </div>
                          <div class="product-detail-body">
                            <div class="meta">
                              <span v-if="customerProductDialog.product.priceState === 'PRICED'">
                                价格
                                {{
                                  formatMoney(
                                    customerProductDialog.product.priceAmount,
                                    customerProductDialog.product.priceCurrencyId,
                                    customerContext.summary?.currencies,
                                  )
                                }}
                              </span>
                              <span v-else>无标价（不可购买）</span>
                              <span v-if="customerProductDialog.product.isLimitStock">｜库存 {{ customerProductDialog.product.stock }}</span>
                            </div>
                            <div style="margin-top: 8px">
                              {{ customerProductDialog.product.description || '无简介' }}
                            </div>
                          </div>
                        </div>
                        <el-divider />
                        <div class="flex" style="justify-content: flex-end; gap: 8px">
                          <el-input-number v-model="customerProductDialog.qty" :min="1" :max="99" />
                          <el-button
                            type="primary"
                            :disabled="
                              customerProductDialog.product.priceState !== 'PRICED' ||
                              (customerProductDialog.product.isLimitStock && customerProductDialog.product.stock <= 0)
                            "
                            @click="purchase(customerProductDialog.product.id, customerProductDialog.qty || 1)"
                          >
                            购买
                          </el-button>
                        </div>
                      </div>
                    </el-dialog>
                  </el-tab-pane>

                  <el-tab-pane label="钱包/背包" name="bag">
                    <el-card>
                      <div>
                        当前模式： <strong>{{ customerContext.summary?.shop?.walletMode || 'PERSONAL' }}</strong>
                      </div>
                      <div v-if="customerContext.summary?.shop?.walletMode === 'TEAM'">
                        <div class="meta">全队余额：</div>
                        <div v-for="b in (customerContext.summary?.balances?.team || [])" :key="b.currencyId">
                          {{ formatMoney(b.amount, b.currencyId, customerContext.summary?.currencies) }}
                        </div>
                      </div>
                      <div v-else>
                        <div class="meta">个人余额：</div>
                        <div v-for="b in (customerContext.summary?.balances?.personal || [])" :key="b.currencyId">
                          {{ formatMoney(b.amount, b.currencyId, customerContext.summary?.currencies) }}
                        </div>
                      </div>
                      <el-divider />
                      <div class="meta" style="margin-bottom: 8px">
                        顾客自助调整余额（用于奖励结算/场外花销；全队模式下调整的是全队余额）
                      </div>
                      <div class="flex" style="justify-content: flex-start; gap: 8px; flex-wrap: wrap">
                        <el-input-number v-model="customerAdjustState.amount" :min="0" :max="999999999" />
                        <el-select v-model="customerAdjustState.currencyId" style="width: 160px">
                          <el-option
                            v-for="c in (customerContext.summary?.currencies || []).filter((x) => x.isActive)"
                            :key="c.id"
                            :label="c.name"
                            :value="c.id"
                          />
                        </el-select>
                        <el-button
                          type="success"
                          :disabled="!customerContext.summary?.shop?.allowCustomerInc"
                          @click="selfAdjustBalanceSigned(1)"
                        >
                          增加
                        </el-button>
                        <el-button
                          type="danger"
                          :disabled="!customerContext.summary?.shop?.allowCustomerDec"
                          @click="selfAdjustBalanceSigned(-1)"
                        >
                          减少
                        </el-button>
                        <span class="meta">
                          当前：允许自增 {{ customerContext.summary?.shop?.allowCustomerInc ? '是' : '否' }} / 允许自减
                          {{ customerContext.summary?.shop?.allowCustomerDec ? '是' : '否' }}
                        </span>
                      </div>
                    </el-card>
                    <el-table :data="customerContext.inventory" size="small" style="width: 100%; margin-top: 12px">
                      <el-table-column label="图标" width="70">
                        <template #default="{ row }">
                          <span v-if="row.icon && String(row.icon).startsWith('http')"><img :src="row.icon" class="icon" /></span>
                          <span v-else>{{ row.icon || '📦' }}</span>
                        </template>
                      </el-table-column>
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
          <div class="layout" :class="{ 'sidebar-collapsed': managerSidebarCollapsed }">
            <aside class="sidebar">
              <div class="flex" style="justify-content: flex-start; gap: 8px">
                <div class="sidebar-title">管理的小店</div>
                <el-button size="small" plain @click="managerSidebarCollapsed = !managerSidebarCollapsed">
                  {{ managerSidebarCollapsed ? '展开' : '折叠' }}
                </el-button>
              </div>
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
                        <el-button type="primary" @click="saveShopSettings">保存设置</el-button>
                      </el-form>
                      <el-divider />
                      <div class="meta" style="margin-bottom: 8px">币种管理（独立币种，互不换算）</div>
                      <div class="flex" style="justify-content: flex-start; gap: 8px; flex-wrap: wrap">
                        <el-input v-model="currencyCreateForm.name" placeholder="新增币种名" style="max-width: 220px" />
                        <el-button type="primary" plain @click="createCurrency">添加币种</el-button>
                      </div>
                      <el-table :data="managerContext.summary?.currencies || []" size="small" style="width: 100%; margin-top: 8px">
                        <el-table-column prop="id" label="ID" width="90" />
                        <el-table-column prop="name" label="名称" />
                        <el-table-column label="状态" width="120">
                          <template #default="{ row }">
                            <el-tag v-if="row.isActive" size="small" type="success">启用</el-tag>
                            <el-tag v-else size="small" type="warning">已删除</el-tag>
                          </template>
                        </el-table-column>
                        <el-table-column label="操作" width="220">
                          <template #default="{ row }">
                            <el-button size="small" plain :disabled="!row.isActive" @click="renameCurrency(row)">改名</el-button>
                            <el-button size="small" type="danger" plain :disabled="!row.isActive" @click="deleteCurrency(row)">删除</el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                      <el-divider />
                      <div class="meta" style="margin-bottom: 8px">顾客自助调整余额开关（用于跑团结算/场外花销）</div>
                      <div class="flex" style="justify-content: flex-start; gap: 12px">
                        <el-switch
                          :model-value="!!managerContext.summary?.shop?.allowCustomerInc"
                          active-text="允许自增"
                          @change="(v) => setCustomerAdjustSwitches(!!v, !!managerContext.summary?.shop?.allowCustomerDec)"
                        />
                        <el-switch
                          :model-value="!!managerContext.summary?.shop?.allowCustomerDec"
                          active-text="允许自减"
                          @change="(v) => setCustomerAdjustSwitches(!!managerContext.summary?.shop?.allowCustomerInc, !!v)"
                        />
                      </div>
                    </el-card>

                    <el-card style="margin-bottom: 12px">
                      <template #header>邀请码（10分钟过期）</template>
                      <div class="flex" style="gap: 8px; justify-content: flex-start">
                        <el-input style="max-width: 140px" v-model="inviteState.ttlMinutes" />
                        <el-button type="primary" @click="createInvite">生成邀请码</el-button>
                      </div>
                      <div class="meta" style="margin-top: 6px">店长/店员可手动删除邀请码；过期后自动清理。</div>
                      <el-table :data="inviteState.invites" size="small" style="width: 100%; margin-top: 8px">
                        <el-table-column prop="code" label="邀请码" width="140" />
                        <el-table-column prop="expiresAt" label="过期时间" width="190" />
                        <el-table-column label="操作" width="120">
                          <template #default="{ row }">
                            <el-button size="small" type="danger" plain @click="deleteInvite(row.id)">删除</el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                    </el-card>

                    <el-row :gutter="16">
                      <el-col :xs="24" :md="10">
                        <el-card>
                          <template #header>钱包模式（全店统一）</template>
                          <div class="meta">个人 ↔ 全队：切换会合并/均摊所有顾客余额（店长/店员不参与）。</div>
                          <div class="flex" style="justify-content: flex-start; gap: 8px; margin-top: 8px; flex-wrap: wrap">
                            <el-tag v-if="managerContext.summary?.shop?.walletMode === 'TEAM'" type="success">TEAM</el-tag>
                            <el-tag v-else type="info">PERSONAL</el-tag>
                            <el-button
                              size="small"
                              plain
                              :disabled="managerContext.summary?.shop?.walletMode === 'TEAM'"
                              @click="switchWalletMode('TEAM')"
                            >
                              切换为 TEAM（合并顾客余额）
                            </el-button>
                            <el-button
                              size="small"
                              plain
                              :disabled="managerContext.summary?.shop?.walletMode !== 'TEAM'"
                              @click="switchWalletMode('PERSONAL')"
                            >
                              切换为 PERSONAL（均摊顾客余额）
                            </el-button>
                          </div>
                          <div v-if="managerContext.summary?.shop?.walletMode === 'TEAM'" style="margin-top: 8px">
                            <div class="meta">当前全队余额：</div>
                            <div v-for="b in (managerContext.summary?.balances?.team || [])" :key="b.currencyId">
                              {{ formatMoney(b.amount, b.currencyId, managerContext.summary?.currencies) }}
                            </div>
                          </div>
                        </el-card>
                      </el-col>
                      <el-col :xs="24" :md="14">
                        <el-card>
                          <template #header>加减余额</template>
                          <el-form :model="grantForm" label-width="70px">
                            <el-form-item label="金额">
                              <div class="flex" style="justify-content: flex-start; gap: 8px; width: 100%; flex-wrap: wrap">
                                <el-input-number v-model="grantForm.amount" :min="0" :max="999999999" />
                                <el-select v-model="grantForm.currencyId" style="width: 160px">
                                  <el-option
                                    v-for="c in (managerContext.summary?.currencies || []).filter((x) => x.isActive)"
                                    :key="c.id"
                                    :label="c.name"
                                    :value="c.id"
                                  />
                                </el-select>
                                <el-select v-model="grantForm.sign" style="width: 110px">
                                  <el-option label="增加" :value="1" />
                                  <el-option label="减少" :value="-1" />
                                </el-select>
                              </div>
                            </el-form-item>
                            <el-form-item label="目标">
                              <el-select v-model="grantForm.target">
                                <el-option label="个人" value="personal" />
                                <el-option label="全队" value="team" :disabled="managerContext.summary?.shop?.walletMode !== 'TEAM'" />
                              </el-select>
                            </el-form-item>
                            <el-form-item v-if="grantForm.target === 'personal'" label="顾客">
                              <el-select v-model="grantForm.memberId" style="width: 100%">
                                <el-option
                                  v-for="m in managerContext.members.filter((x) => x.role === 'CUSTOMER')"
                                  :key="m.id"
                                  :label="m.charName"
                                  :value="m.id"
                                />
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
                    <div v-if="!managerContext.stalls.length" class="meta">暂无摊位。</div>
                    <div v-else class="store-layout">
                      <aside class="stall-list">
                        <div class="flex" style="margin-bottom: 8px">
                          <div class="sidebar-title">摊位</div>
                          <el-button size="small" plain @click="openAddStall">新增摊位</el-button>
                        </div>
                        <el-collapse accordion v-model="managerStoreState.stallId">
                          <el-collapse-item v-for="stall in managerContext.stalls" :key="stall.id" :name="String(stall.id)">
                            <template #title>
                              <div class="flex" style="width: 100%; gap: 8px">
                                <span>{{ stall.name }}</span>
                                <el-tag v-if="!stall.isActive" size="small" type="warning">已隐藏</el-tag>
                              </div>
                            </template>
                            <div class="meta">{{ stall.description || '无描述' }}</div>
                            <div class="flex" style="justify-content: flex-start; gap: 8px; margin-top: 8px; flex-wrap: wrap">
                              <el-button size="small" plain @click="toggleStallActive(stall)">
                                {{ stall.isActive ? '隐藏摊位（仅顾客不可见）' : '启用摊位' }}
                              </el-button>
                            </div>
                          </el-collapse-item>
                        </el-collapse>
                      </aside>

                      <div class="product-area">
                        <div class="flex" style="margin-bottom: 8px">
                          <strong>{{ selectedManagerStall?.name || '未选择摊位' }}</strong>
                          <span class="meta" v-if="selectedManagerStall">ID {{ selectedManagerStall.id }}</span>
                        </div>

                        <el-row :gutter="12">
                          <el-col
                            v-for="p in (selectedManagerStall?.products || [])"
                            :key="p.id"
                            :xs="12"
                            :sm="8"
                            :md="6"
                            :lg="6"
                          >
                            <el-card class="product-card clickable" shadow="hover" @click="openManagerEditProduct(selectedManagerStall.id, p)">
                              <div class="product-header">
                                <span v-if="p.icon && p.icon.startsWith('http')"><img :src="p.icon" class="icon" /></span>
                                <span v-else class="product-emoji">{{ p.icon || '🧩' }}</span>
                                <div class="product-title">
                                  <div class="product-name">
                                    {{ p.name }}
                                    <el-tag v-if="!p.isActive" size="small" type="warning" style="margin-left: 6px">已下架</el-tag>
                                  </div>
                                  <div class="meta">
                                    <span v-if="p.priceState === 'PRICED'">
                                      价格 {{ formatMoney(p.priceAmount, p.priceCurrencyId, managerContext.summary?.currencies) }}
                                    </span>
                                    <span v-else-if="p.priceState === 'DISABLED_CURRENCY'">币种已删除（无标价）</span>
                                    <span v-else>无标价</span>
                                    <span v-if="p.isLimitStock">｜库存 {{ p.stock }}</span>
                                  </div>
                                </div>
                              </div>
                            </el-card>
                          </el-col>

                          <el-col :xs="12" :sm="8" :md="6" :lg="6" v-if="selectedManagerStall">
                            <el-card class="product-card clickable add-card" shadow="hover" @click="openManagerAddProduct(selectedManagerStall.id)">
                              <div class="add-card-inner">
                                <div class="add-plus">＋</div>
                                <div class="meta">添加商品</div>
                              </div>
                            </el-card>
                          </el-col>
                        </el-row>

                        <div v-if="selectedManagerStall && !(selectedManagerStall.products || []).length" class="meta">
                          该摊位暂无商品，点击“添加商品”创建。
                        </div>
                      </div>
                    </div>

                    <el-dialog v-model="managerProductDialog.visible" width="560px" :show-close="false">
                      <template #header>
                        <div class="flex" style="width: 100%">
                          <strong>{{ managerProductDialog.mode === 'add' ? '添加商品' : '商品设置' }}</strong>
                          <el-button text @click="managerProductDialog.visible = false">✕</el-button>
                        </div>
                      </template>
                      <el-form :model="managerProductDialog.form" label-width="90px">
                        <el-form-item label="名称">
                          <el-input v-model="managerProductDialog.form.name" />
                        </el-form-item>
                        <el-form-item label="图标">
                          <el-input v-model="managerProductDialog.form.icon" placeholder="Emoji 或 图片URL" />
                        </el-form-item>
                        <el-form-item label="定价状态">
                          <el-select v-model="managerProductDialog.form.priceState" style="width: 180px">
                            <el-option label="无定价（不可购买）" value="UNPRICED" />
                            <el-option label="已定价" value="PRICED" />
                          </el-select>
                          <el-tag v-if="managerProductDialog.form.priceState === 'DISABLED_CURRENCY'" type="warning" style="margin-left: 8px">
                            币种已删除
                          </el-tag>
                        </el-form-item>
                        <el-form-item v-if="managerProductDialog.form.priceState === 'PRICED'" label="价格">
                          <div class="flex" style="justify-content: flex-start; gap: 8px; width: 100%; flex-wrap: wrap">
                            <el-input-number v-model="managerProductDialog.form.priceAmount" :min="0" :max="999999999" />
                            <el-select v-model="managerProductDialog.form.priceCurrencyId" style="width: 200px">
                              <el-option
                                v-for="c in (managerContext.summary?.currencies || []).filter((x) => x.isActive)"
                                :key="c.id"
                                :label="c.name"
                                :value="c.id"
                              />
                            </el-select>
                          </div>
                        </el-form-item>
                        <el-form-item label="限库存">
                          <el-switch v-model="managerProductDialog.form.isLimitStock" />
                        </el-form-item>
                        <el-form-item label="库存">
                          <el-input-number v-model="managerProductDialog.form.stock" :min="0" :max="999999999" :disabled="!managerProductDialog.form.isLimitStock" />
                        </el-form-item>
                        <el-form-item label="上架状态">
                          <el-switch v-model="managerProductDialog.form.isActive" />
                        </el-form-item>
                        <el-form-item label="简介">
                          <el-input type="textarea" v-model="managerProductDialog.form.description" rows="3" />
                        </el-form-item>
                        <div class="flex" style="justify-content: flex-end; gap: 8px">
                          <el-button @click="managerProductDialog.visible = false">取消</el-button>
                          <el-button type="primary" @click="saveManagerProduct">保存</el-button>
                        </div>
                      </el-form>
                    </el-dialog>

                    <el-dialog v-model="managerStallDialog.visible" width="520px" :show-close="false">
                      <template #header>
                        <div class="flex" style="width: 100%">
                          <strong>新增摊位</strong>
                          <el-button text @click="managerStallDialog.visible = false">✕</el-button>
                        </div>
                      </template>
                      <el-form :model="managerStallDialog.form" label-width="90px">
                        <el-form-item label="名称">
                          <el-input v-model="managerStallDialog.form.name" />
                        </el-form-item>
                        <el-form-item label="描述">
                          <el-input v-model="managerStallDialog.form.description" />
                        </el-form-item>
                        <div class="flex" style="justify-content: flex-end; gap: 8px">
                          <el-button @click="managerStallDialog.visible = false">取消</el-button>
                          <el-button type="primary" @click="saveManagerStall">创建</el-button>
                        </div>
                      </el-form>
                    </el-dialog>
                  </el-tab-pane>

                  <el-tab-pane label="顾客背包" name="bag">
                    <el-row :gutter="16">
                      <el-col :xs="24" :md="8">
                        <el-card>
                          <template #header>选择顾客</template>
                          <el-select v-model="managerBagState.selectedMemberId" style="width: 100%" @change="loadManagerInventory">
                            <el-option
                              v-for="m in managerContext.members.filter((x) => x.role === 'CUSTOMER')"
                              :key="m.id"
                              :label="m.charName"
                              :value="m.id"
                            />
                          </el-select>
                          <el-divider />
                          <div class="meta" style="margin-bottom: 8px">余额展示请在“加减余额”处按币种操作。</div>
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
                            <el-table-column label="图标" width="70">
                              <template #default="{ row }">
                                <span v-if="row.icon && String(row.icon).startsWith('http')"><img :src="row.icon" class="icon" /></span>
                                <span v-else>{{ row.icon || '📦' }}</span>
                              </template>
                            </el-table-column>
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

.clickable {
  cursor: pointer;
}

.app {
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 0;
}

.flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 6px;
  min-height: calc(100vh - 170px);
}

.layout.sidebar-collapsed {
  grid-template-columns: 56px 1fr;
}

.layout.sidebar-collapsed .sidebar-title {
  display: none;
}

.layout.sidebar-collapsed .el-menu-item span {
  display: none;
}

.sidebar {
  border: 1px solid #eee;
  border-radius: 6px;
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
  border-radius: 6px;
  padding: 6px;
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

.store-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  align-items: start;
}

.stall-list {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
  overflow: auto;
}

.product-area {
  min-width: 0;
}

.product-card {
  margin-bottom: 12px;
}

.product-header {
  display: flex;
  gap: 10px;
  align-items: center;
}

.product-emoji {
  font-size: 20px;
  line-height: 24px;
  width: 24px;
  text-align: center;
}

.product-title {
  min-width: 0;
}

.product-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.buy-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.add-card {
  border: 1px dashed #ddd;
}

.add-card-inner {
  height: 78px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.add-plus {
  font-size: 26px;
  line-height: 26px;
}

.product-detail {
  display: flex;
  gap: 12px;
}

.product-detail-icon {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.product-detail-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.product-detail-emoji {
  font-size: 52px;
}

.product-detail-body {
  flex: 1;
  min-width: 0;
}

html,
body {
  margin: 0;
  padding: 0;
}

#app {
  min-height: 100vh;
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

  .store-layout {
    grid-template-columns: 1fr;
  }
}
</style>
