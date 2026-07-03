import type { ProviderRole } from '@dimol/shared';
import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { QuoteStore, QuoteValidationError } from '../quotes/store.js';

/** 견적 히스토리·평균 시세 API (로드맵 Phase 3). */
export function createQuotesRouter(store: QuoteStore): Router {
  const router = Router();

  function parseParty(raw: unknown): ProviderRole | undefined {
    return raw === 'TRANSPORT' || raw === 'DISPOSAL' ? raw : undefined;
  }

  // POST /api/quotes  { requestId, providerId, party, amount, memo? }
  router.post('/quotes', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const quote = store.createQuote({
        requestId: String(body.requestId ?? ''),
        providerId: authUserId(req),
        party: body.party as ProviderRole,
        amount: Number(body.amount),
        memo: typeof body.memo === 'string' ? body.memo : undefined,
      });
      res.status(201).json(quote);
    } catch (err) {
      if (err instanceof QuoteValidationError) {
        const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '견적 처리 오류' });
    }
  });

  // GET /api/quotes?requestId=&providerId=&party= — 견적 히스토리 (최신순)
  router.get('/quotes', (req, res) => {
    const { requestId, providerId, party } = req.query;
    res.json(
      store.listQuotes({
        requestId: typeof requestId === 'string' ? requestId : undefined,
        providerId: typeof providerId === 'string' ? providerId : undefined,
        party: parseParty(party),
      }),
    );
  });

  // GET /api/quotes/market-rate?party=TRANSPORT|DISPOSAL — 평균 시세
  router.get('/quotes/market-rate', (req, res) => {
    const party = parseParty(req.query.party);
    if (!party) {
      res.status(400).json({ error: 'party 는 TRANSPORT | DISPOSAL 이어야 합니다.' });
      return;
    }
    res.json(store.marketRate(party));
  });

  return router;
}
