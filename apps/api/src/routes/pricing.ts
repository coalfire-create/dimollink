import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { PricingStore, PricingValidationError } from '../pricing/store.js';

/** 업체 단가 API (로드맵 Phase 2). 본인만 자기 단가를 조회·설정한다. */
export function createPricingRouter(store: PricingStore): Router {
  const router = Router();

  // GET /api/pricing/:userId — 단가 조회(본인만). 미설정이면 null.
  router.get('/pricing/:userId', (req, res) => {
    if (authUserId(req) !== req.params.userId) {
      res.status(403).json({ error: '본인 단가만 조회할 수 있어요.' });
      return;
    }
    res.json(store.get(req.params.userId) ?? null);
  });

  // PUT /api/pricing/:userId  { unitPrice } — 단가 설정(본인만).
  router.put('/pricing/:userId', (req, res) => {
    if (authUserId(req) !== req.params.userId) {
      res.status(403).json({ error: '본인 단가만 설정할 수 있어요.' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(store.set(req.params.userId, Number(body.unitPrice)));
    } catch (err) {
      if (err instanceof PricingValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '단가 저장 오류' });
    }
  });

  return router;
}
