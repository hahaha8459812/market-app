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
  // Auto-select last shop or first shop if not in a specific shop route
  if (!route.params.shopId && customerShops.value.length > 0) {
    const last = localStorage.getItem('last_customer_shop');
    const target = last && customerShops.value.find(s => String(s.shopId) === last) 
      ? last 
      : customerShops.value[0].shopId;
    router.replace(`/customer/${target}`);
  }
});

const customerShops = computed(() => shopStore.myShops.filter(s => s.role === 'CUSTOMER'));

watch(() => route.params.shopId, (val) => {
  if (val) localStorage.setItem('last_customer_shop', val);
});
</script>

<template>
  <ShopLayout :shops="customerShops" base-path="/customer" title="已加入小店">
    <router-view></router-view>
  </ShopLayout>
</template>
