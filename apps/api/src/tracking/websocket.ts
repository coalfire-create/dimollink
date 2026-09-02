import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'node:url';
import type { GeoPoint } from '@dimol/shared';

export interface TrackingUpdate {
  requestId: string;
  location: GeoPoint;
  timestamp: string;
}

// In-memory pub/sub (for single instance, Phase C). 
// For distributed, use Redis pub/sub.
const subscribers = new Map<string, Set<WebSocket>>();

export function setupTrackingWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    // Only handle /ws/tracking
    if (request.url?.startsWith('/ws/tracking')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, request) => {
    // Parse URL and query params
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const requestId = url.searchParams.get('requestId');
    const role = url.searchParams.get('role'); // 'provider' or 'consumer'

    if (!requestId || !role) {
      ws.close(1008, 'Missing requestId or role');
      return;
    }

    if (role === 'consumer') {
      // Subscribe to updates for this request
      if (!subscribers.has(requestId)) {
        subscribers.set(requestId, new Set());
      }
      subscribers.get(requestId)!.add(ws);

      ws.on('close', () => {
        const subs = subscribers.get(requestId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            subscribers.delete(requestId);
          }
        }
      });
    }

    ws.on('message', (message) => {
      try {
        if (role === 'provider') {
          // Broadcast to all consumers subscribed to this requestId
          const data = JSON.parse(message.toString());
          const update: TrackingUpdate = {
            requestId,
            location: data.location,
            timestamp: new Date().toISOString(),
          };
          
          const subs = subscribers.get(requestId);
          if (subs) {
            const payload = JSON.stringify(update);
            for (const client of subs) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
              }
            }
          }
        }
      } catch (err) {
        console.error('[tracking] Invalid message format', err);
      }
    });
  });

  console.log('[tracking] WebSocket server initialized on /ws/tracking');
}
