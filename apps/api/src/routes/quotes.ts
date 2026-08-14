import { visibleQuotes, type ProviderRole } from '@dimol/shared';
import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { QuoteStore, QuoteValidationError } from '../quotes/store.js';
import type { RequestStore } from '../requests/store.js';
import type { UserStore } from '../users/store.js';

/** 견적 히스토리·평균 시세 API (로드맵 Phase 3). */
export function createQuotesRouter(
  store: QuoteStore,
  userStore: UserStore,
  requestStore: RequestStore,
): Router {
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

  // POST /api/quotes/:id/accept — 배출자(요청자 본인)가 견적 수락 → 정산 금액 확정
  router.post('/quotes/:id/accept', (req, res) => {
    try {
      res.json(store.accept(req.params.id, authUserId(req)));
    } catch (err) {
      if (err instanceof QuoteValidationError) {
        const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '견적 수락 처리 오류' });
    }
  });

  // GET /api/quotes?requestId=&providerId=&party= — 견적 히스토리 (최신순)
  //
  // 밀봉 접근제어(로드맵 Phase 1 — visibleQuotes 원칙):
  //  · 요청자(배출자)  → 해당 요청의 모든 견적
  //  · 업체(운반/처리) → 자기가 제출한 견적만 (경쟁사 금액 비공개)
  //  · 소비자(제3자)   → 금액 열람 불가(빈 목록). 요청 상태·매칭결과는 /api/requests 로 확인
  router.get('/quotes', (req, res) => {
    const { requestId, providerId, party } = req.query;
    const viewerId = authUserId(req);
    const viewerIsConsumer = userStore.get(viewerId)?.userType === 'CONSUMER';

    // 요청 미지정 전체 조회는 경쟁사 금액을 노출한다 → 본인 제출 견적만 반환(소비자는 빈 목록).
    if (typeof requestId !== 'string' || requestId === '') {
      res.json(
        viewerIsConsumer
          ? []
          : store.listQuotes({ providerId: viewerId, party: parseParty(party) }),
      );
      return;
    }

    const request = requestStore.get(requestId);
    if (!request) {
      res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      return;
    }
    const all = store.listQuotes({
      requestId,
      providerId: typeof providerId === 'string' ? providerId : undefined,
      party: parseParty(party),
    });
    res.json(visibleQuotes(all, viewerId, viewerIsConsumer, request.requesterId));
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
