import { Router } from 'express';
import type { PgQueryable } from '../lib/pg-collection.js';

export function createHealthRouter(pool?: PgQueryable): Router {
  const router = Router();

  /** 라이브니스 — 프로세스가 살아있는지(오케스트레이터 재시작 판단용). */
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'dimol-api', time: new Date().toISOString() });
  });
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /**
   * 레디니스 — 트래픽 수용 준비 여부.
   * PostgreSQL 풀이 주입된 경우 실제 연결 상태를 확인한다.
   */
  router.get('/health/ready', async (_req, res) => {
    if (pool) {
      try {
        await pool.query('SELECT 1');
      } catch {
        res.status(503).json({ status: 'not_ready' });
        return;
      }
    }
    res.json({ status: 'ready', uptimeSec: Math.floor(process.uptime()) });
  });

  return router;
}

export const healthRouter = createHealthRouter();
