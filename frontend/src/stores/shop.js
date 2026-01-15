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
      const p = [
        shopApi.getShopSummary(shopId),
        shopApi.getShopStalls(shopId),
        shopApi.getShopLogs(shopId, { limit: isManager ? 50 : 10 })
      ];

      if (isManager) {
        p.push(shopApi.getShopMembers(shopId));
        // inventory is loaded separately for manager or just loaded all? API says getShopInventory needs memberId for manager
      } else {
        p.push(shopApi.getShopPublicMembers(shopId));
        p.push(shopApi.getShopInventory(shopId));
      }

      const results = await Promise.all(p);
      currentShop.value = results[0].data;
      stalls.value = results[1].data;
      logs.value = results[2].data;
      members.value = results[3].data;

      if (!isManager) {
        inventory.value = results[4].data;
      }
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
