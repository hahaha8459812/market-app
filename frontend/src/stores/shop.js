import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as shopApi from '../api/shops';
import { useWsStore } from './ws';

export const useShopStore = defineStore('shop', () => {
  const myShops = ref([]);
  const currentShop = ref(null);
  const currentShopId = ref(null);
  const loading = ref(false);
  
  // Shop Details
  const stalls = ref([]);
  const members = ref([]);
  const inventory = ref([]);
  const logs = ref([]);
  const invites = ref([]);

  const wsStore = useWsStore();

  const fetchMyShops = async () => {
    try {
      const res = await shopApi.getMyShops();
      myShops.value = res.data;
    } catch (err) {
      console.error(err);
    }
  };

  const loadShop = async (shopId, isManager = false) => {
    loading.value = true;

    if (currentShopId.value && String(currentShopId.value) !== String(shopId)) {
      wsStore.unsubscribe(currentShopId.value);
    }

    currentShopId.value = shopId;
    wsStore.subscribe(shopId);

    try {
      const common = await Promise.all([
        shopApi.getShopSummary(shopId),
        shopApi.getShopStalls(shopId),
        isManager ? shopApi.getShopMembers(shopId) : shopApi.getShopPublicMembers(shopId),
        isManager ? Promise.resolve({ data: [] }) : shopApi.getShopInventory(shopId),
      ]);

      currentShop.value = common[0].data;
      stalls.value = common[1].data;
      members.value = common[2].data;
      if (!isManager) inventory.value = common[3].data;

      const walletMode = currentShop.value?.shop?.walletMode;
      const logLimit = isManager ? 50 : walletMode === 'TEAM' ? 200 : 10;
      const logRes = await shopApi.getShopLogs(shopId, { limit: logLimit });
      logs.value = logRes.data;
    } catch (err) {
      console.error(err);
    } finally {
      loading.value = false;
    }
  };

  const refreshCurrentShop = async (isManager = false) => {
    if (currentShopId.value) {
      await loadShop(currentShopId.value, isManager);
    }
  };

  // Setup WS listener
  wsStore.addListener((msg) => {
    if (msg.shopId && String(msg.shopId) === String(currentShopId.value)) {
      // Simple refresh strategy: reload data on any relevant event
      // Optimization: inspect msg.type to decide what to reload
      const isManager = myShops.value.find(s => s.shopId == currentShopId.value)?.role !== 'CUSTOMER';
      refreshCurrentShop(isManager);
    }
  });

  return {
    myShops,
    currentShop,
    currentShopId,
    stalls,
    members,
    inventory,
    logs,
    loading,
    fetchMyShops,
    loadShop,
    refreshCurrentShop
  };
});
