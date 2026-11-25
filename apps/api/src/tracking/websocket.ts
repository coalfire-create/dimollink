import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'node:url';
import { isValidGeoPoint, type GeoPoint } from '@dimol/shared';
import type { SessionStore } from '../auth/session-store.js';
import type { RequestStore } from '../requests/store.js';

export interface TrackingUpdate {
  requestId: string;
  location: GeoPoint;
  timestamp: string;
}

export interface TrackingWsDeps {
  sessionStore: SessionStore;
  requestStore: RequestStore;
}

// In-memory pub/sub (for single instance, Phase C).
// For distributed, use Redis pub/sub.
const subscribers = new Map<string, Set<WebSocket>>();

function extractToken(url: URL, authHeader?: string): string | undefined {
  const fromQuery = url.searchParams.get('token')?.trim();
  if (fromQuery) return fromQuery;
  if (!authHeader) return undefined;
  const [scheme, token] = authHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function setupTrackingWebSocket(server: Server, deps?: TrackingWsDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws/tracking')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }
    socket.destroy();
  });

  wss.on('connection', (ws, request) => {
    ws.on('error', () => {});

    void (async () => {
      let url: URL;
      try {
        url = new URL(request.url ?? '', 'http://localhost');
      } catch {
        ws.close(1008, 'Invalid URL');
        return;
      }

      const requestId = url.searchParams.get('requestId');
      const role = url.searchParams.get('role');
      if (!requestId || (role !== 'provider' && role !== 'consumer')) {
        ws.close(1008, 'Missing or invalid requestId/role');
        return;
      }

      if (deps) {
        const token = extractToken(url, request.headers.authorization);
        const userId = token ? await deps.sessionStore.resolve(token) : undefined;
        if (!userId) {
          ws.close(1008, 'Unauthorized');
          return;
        }
        const serviceReq = await deps.requestStore.get(requestId);
        if (!serviceReq) {
          ws.close(1008, 'Not found');
          return;
        }
        const allowed =
          role === 'consumer'
            ? serviceReq.requesterId === userId
            : serviceReq.matchedProviderId === userId;
        if (!allowed) {
          ws.close(1008, 'Forbidden');
          return;
        }
      }

      if (role === 'consumer') {
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
          if (role !== 'provider') return;
          const data = JSON.parse(message.toString()) as { location?: unknown };
          const loc = data.location as GeoPoint | undefined;
          if (!loc || !isValidGeoPoint(loc)) return;
          const update: TrackingUpdate = {
            requestId,
            location: loc,
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
        } catch {
          console.warn('[tracking] Invalid message format');
        }
      });
    })().catch(() => {
      ws.close(1011, 'Internal error');
    });
  });

  console.log('[tracking] WebSocket server initialized on /ws/tracking');
  return wss;
}
