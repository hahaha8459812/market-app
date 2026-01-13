import { Injectable } from '@nestjs/common';
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';

type ClientState = {
  subscribedShopIds: Set<number>;
  isAlive: boolean;
};

@Injectable()
export class WsService {
  private wss: WebSocketServer | null = null;

  init(httpServer: Server) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });

    this.wss.on('connection', (socket) => {
      const state: ClientState = { subscribedShopIds: new Set(), isAlive: true };
      (socket as any).__state = state;

      socket.on('pong', () => {
        state.isAlive = true;
      });

      socket.on('message', (buf) => {
        try {
          const msg = JSON.parse(buf.toString());
          if (msg?.type === 'subscribe' && Number.isInteger(msg.shopId)) {
            state.subscribedShopIds.add(msg.shopId);
            socket.send(JSON.stringify({ type: 'subscribed', shopId: msg.shopId }));
          }
          if (msg?.type === 'unsubscribe' && Number.isInteger(msg.shopId)) {
            state.subscribedShopIds.delete(msg.shopId);
            socket.send(JSON.stringify({ type: 'unsubscribed', shopId: msg.shopId }));
          }
        } catch {
          // ignore
        }
      });

      socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
    });
  }

  startHeartbeat(pingIntervalMs: number) {
    if (!this.wss) return;
    setInterval(() => {
      for (const socket of this.wss!.clients) {
        const state = (socket as any).__state as ClientState | undefined;
        if (!state) continue;

        if (state.isAlive === false) {
          socket.terminate();
          continue;
        }
        state.isAlive = false;
        socket.ping(String(Date.now()));
      }
    }, pingIntervalMs).unref();
  }

  emitToShop(shopId: number, payload: any) {
    if (!this.wss) return;
    const data = JSON.stringify(payload);
    for (const socket of this.wss.clients) {
      const state = (socket as any).__state as ClientState | undefined;
      if (!state) continue;
      if (!state.subscribedShopIds.has(shopId)) continue;
      socket.send(data);
    }
  }
}

