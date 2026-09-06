import type { MatchOfferStatus } from '@dimol/shared';
import { Router } from 'express';
import { OfferStore, OfferValidationError } from '../offers/store.js';

/**
 * 자동매칭 오퍼 API (로드맵 Phase 3 · 타임아웃/재매칭).
 * 만료 판정은 각 요청 처리 시 지연 스윕으로 수행되며, POST /offers/sweep 으로
 * 명시적으로 돌려 만료 건(재매칭 대상)을 조회할 수도 있다.
 */
export function createOffersRouter(store: OfferStore): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof OfferValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '매칭 제안 처리 오류' });
  }

  // POST /api/offers  { requestId, providerId, ttlMinutes? }
  router.post('/offers', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const offer = await store.createOffer({
        requestId: String(body.requestId ?? ''),
        providerId: String(body.providerId ?? ''),
        ttlMinutes: typeof body.ttlMinutes === 'number' ? body.ttlMinutes : undefined,
      });
      res.status(201).json(offer);
    } catch (err) {
      handleError(err, res);
    }
  });

  // POST /api/offers/sweep — 만료 스윕 실행, 이번에 만료된 건(재매칭 대상) 반환
  router.post('/offers/sweep', async (_req, res) => {
    res.json({ expired: await store.sweepExpired() });
  });

  // POST /api/offers/:id/accept | /decline — 업체 응답
  router.post('/offers/:id/accept', async (req, res) => {
    try {
      res.json(await store.respond(req.params.id, 'ACCEPT'));
    } catch (err) {
      handleError(err, res);
    }
  });
  router.post('/offers/:id/decline', async (req, res) => {
    try {
      res.json(await store.respond(req.params.id, 'DECLINE'));
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/offers?requestId=&providerId=&status=
  router.get('/offers', async (req, res) => {
    const { requestId, providerId, status } = req.query;
    res.json(
      await store.list({
        requestId: typeof requestId === 'string' ? requestId : undefined,
        providerId: typeof providerId === 'string' ? providerId : undefined,
        status: typeof status === 'string' ? (status as MatchOfferStatus) : undefined,
      }),
    );
  });

  return router;
}
