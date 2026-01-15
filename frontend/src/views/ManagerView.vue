<script setup>
import { computed, onMounted, watch } from 'vue';
import { useShopStore } from '../stores/shop';
import { useRouter, useRoute } from 'vue-router';
import ShopLayout from '../layouts/ShopLayout.vue';

const shopStore = useShopStore();
const router = useRouter();
const route = useRoute();

onMounted(async () => {
  await shopStore.fetchMyShops();
  // Auto-select last shop or first shop
  if (!route.params.shopId && managerShops.value.length > 0) {
    const last = localStorage.getItem('last_manager_shop');
    const target = last && managerShops.value.find(s => String(s.shopId) === last) 
      ? last 
      : managerShops.value[0].shopId;
    router.replace(`/manager/${target}`);
  }
});

const managerShops = computed(() => shopStore.myShops.filter(s => ['OWNER', 'CLERK'].includes(s.role)));

watch(() => route.params.shopId, (val) => {
  if (val) localStorage.setItem('last_manager_shop', val);
});
</script>

<template>
  <ShopLayout :shops="managerShops" base-path="/manager" title="我管理的小店">
    <router-view></router-view>
  </ShopLayout>
</template>
