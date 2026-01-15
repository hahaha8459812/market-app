import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useWsStore = defineStore('ws', () => {
  const status = ref('disconnected');
  const ws = ref(null);
  const subscribedShopId = ref(null);
  const listeners = ref(new Set());
  const shouldReconnect = ref(false);

  const connect = () => {
    shouldReconnect.value = true;
    if (ws.value) return;

    // Only connect when authenticated
    const token = localStorage.getItem('market_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws`;
    
    status.value = 'connecting';
    const socket = new WebSocket(url);
    ws.value = socket;

    socket.onopen = () => {
      status.value = 'connected';
      if (subscribedShopId.value) {
        subscribe(subscribedShopId.value);
      }
    };

    socket.onclose = () => {
      status.value = 'disconnected';
      ws.value = null;
      if (shouldReconnect.value && localStorage.getItem('market_token')) {
        setTimeout(connect, 2000);
      }
    };

    socket.onerror = () => {
      status.value = 'error';
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        listeners.value.forEach(callback => callback(msg));
      } catch (e) {
        console.error('WS parse error', e);
      }
    };
  };

  const subscribe = (shopId) => {
    if (!shopId) return;
    subscribedShopId.value = shopId;
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ type: 'subscribe', shopId }));
    }
  };

  const unsubscribe = (shopId) => {
    if (subscribedShopId.value === shopId) {
      subscribedShopId.value = null;
    }
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ type: 'unsubscribe', shopId }));
    }
  };

  const addListener = (callback) => {
    listeners.value.add(callback);
    return () => listeners.value.delete(callback);
  };

  const close = () => {
    shouldReconnect.value = false;
    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
    status.value = 'disconnected';
    subscribedShopId.value = null;
  };

  return {
    status,
    connect,
    subscribe,
    unsubscribe,
    addListener,
    close
  };
});
