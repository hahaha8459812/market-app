import api from './index';

export const getMyShops = () => api.get('/shops');
export const createShop = (name) => api.post('/shops', { name });
export const joinShop = (data) => api.post('/shops/join', data);
export const leaveShop = (shopId) => api.delete(`/shops/${shopId}/leave`);
export const getShopSummary = (shopId) => api.get(`/shops/${shopId}/summary`);
export const getShopStalls = (shopId) => api.get(`/shops/${shopId}/stalls`);
export const getShopPublicMembers = (shopId) => api.get(`/shops/${shopId}/public-members`);
export const getShopInventory = (shopId, params) => api.get(`/shops/${shopId}/inventory`, { params });
export const getShopLogs = (shopId, params) => api.get(`/shops/${shopId}/logs`, { params });

// Manager specific
export const updateShopName = (shopId, name) => api.patch(`/shops/${shopId}`, { name });
export const deleteShop = (shopId) => api.delete(`/shops/${shopId}`);
export const getShopMembers = (shopId) => api.get(`/shops/${shopId}/members`);
export const setMemberRole = (shopId, data) => api.post(`/shops/${shopId}/set-member-role`, data);
export const createCurrency = (shopId, name) => api.post(`/shops/${shopId}/currencies`, { name });
export const updateCurrency = (shopId, currencyId, name) => api.patch(`/shops/${shopId}/currencies/${currencyId}`, { name });
export const deleteCurrency = (shopId, currencyId) => api.delete(`/shops/${shopId}/currencies/${currencyId}`, { data: { confirm: true } });
export const switchWalletMode = (shopId, mode) => api.post(`/shops/${shopId}/wallet-mode`, { mode });
export const setCustomerAdjust = (shopId, data) => api.patch(`/shops/${shopId}/customer-adjust`, data);
export const grantBalance = (shopId, data) => api.post(`/shops/${shopId}/grant-balance`, data);

// Stalls & Products
export const createStall = (shopId, data) => api.post(`/shops/${shopId}/stalls`, data);
export const updateStall = (shopId, stallId, data) => api.patch(`/shops/${shopId}/stalls/${stallId}`, data);
export const addProduct = (stallId, data) => api.post(`/shops/stalls/${stallId}/products`, data);
export const updateProduct = (shopId, productId, data) => api.patch(`/shops/${shopId}/products/${productId}`, data);
export const purchaseProduct = (shopId, data) => api.post(`/shops/${shopId}/purchase`, data);

// Inventory
export const adjustInventory = (shopId, data) => api.post(`/shops/${shopId}/inventory/adjust`, data);
export const selfAdjustInventory = (shopId, data) => api.post(`/shops/${shopId}/inventory/self-adjust`, data);

// Balance
export const selfAdjustBalance = (shopId, data) => api.post(`/shops/${shopId}/self-adjust`, data);

// Invites
export const createInvite = (shopId, ttlMinutes) => api.post(`/shops/${shopId}/invites`, { ttlMinutes });
export const getInvites = (shopId) => api.get(`/shops/${shopId}/invites`);
export const deleteInvite = (shopId, inviteId) => api.delete(`/shops/${shopId}/invites/${inviteId}`);
