import { Router, type Response } from 'express';
import { providerEstimateAccuracy, visibleDemolitionEstimates } from '@dimol/shared';
import { authUserId } from '../middleware/auth.js';
import { DemolitionEstimateError, type DemolitionEstimateStore } from '../demolition/store.js';
import type { RequestStore } from '../requests/store.js';
import type { UserStore } from '../users/store.js';

/**
 * 철거 견적 라우트 — 개산(범위) → 실사 예약 → 확정 → 수락.
 *
 * 운반·처리의 단발 견적(`/quotes`)과 분리한 이유는 [[demolition-estimate]] 에 있다:
 * 철거 금액은 현장을 봐야 정해져서, 사진만 보고 낸 금액을 계약금액으로 쓰면 안 된다.
 */
export function createDemolitionEstimateRouter(
  store: DemolitionEstimateStore,
  requestStore: RequestStore,
  userStore: UserStore,
): Router {
  const router = Router();

  function fail(err: unknown, res: Response): void {
    if (err instanceof DemolitionEstimateError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '견적 처리 오류' });
  }

  // POST /api/demolition-estimates  { requestId, minAmount, maxAmount, memo? }
  // 1단계 — 업체가 개산 범위를 낸다. 구속력 없음.
  router.post('/demolition-estimates', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const provider = await userStore.get(authUserId(req));
      if (provider?.userType !== 'DEMOLITION_COMPANY') {
        res.status(403).json({ error: '철거업체만 개산 견적을 낼 수 있습니다.' });
        return;
      }
      if (provider.approvalStatus !== 'APPROVED') {
        res.status(403).json({ error: '승인 완료 후 견적을 낼 수 있어요.' });
        return;
      }
      res.status(201).json(
        await store.createPreliminary({
          requestId: String(body.requestId ?? ''),
          providerId: provider.id,
          providerName: provider.name,
          minAmount: Number(body.minAmount),
          maxAmount: Number(body.maxAmount),
          memo: typeof body.memo === 'string' ? body.memo : undefined,
        }),
      );
    } catch (err) {
      fail(err, res);
    }
  });

  // GET /api/demolition-estimates?requestId= — 밀봉 규칙 적용
  router.get('/demolition-estimates', async (req, res) => {
    const requestId = req.query.requestId;
    if (typeof requestId !== 'string' || !requestId) {
      res.status(400).json({ error: 'requestId 가 필요합니다.' });
      return;
    }
    const request = await requestStore.get(requestId);
    if (!request) {
      res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      return;
    }
    const all = await store.listByRequest(requestId);
    res.json(visibleDemolitionEstimates(all, authUserId(req), request.requesterId));
  });

  // POST /api/demolition-estimates/:id/visit  { scheduledAt }
  // 2단계 — 소비자가 실사를 예약한다(최대 3곳).
  router.post('/demolition-estimates/:id/visit', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        await store.scheduleVisit(req.params.id, authUserId(req), String(body.scheduledAt ?? '')),
      );
    } catch (err) {
      fail(err, res);
    }
  });

  // DELETE /api/demolition-estimates/:id/visit — 실사 예약 취소(자리를 비운다)
  router.delete('/demolition-estimates/:id/visit', async (req, res) => {
    try {
      res.json(await store.cancelVisit(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/demolition-estimates/:id/final  { amount, overrunReason?, memo? }
  // 3단계 — 실사를 마친 업체가 확정 금액을 낸다. 개산 상단 초과 시 사유 필수.
  router.post('/demolition-estimates/:id/final', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      res.json(
        await store.submitFinal(
          req.params.id,
          authUserId(req),
          Number(body.amount),
          typeof body.overrunReason === 'string' ? body.overrunReason : undefined,
          typeof body.memo === 'string' ? body.memo : undefined,
        ),
      );
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/demolition-estimates/:id/accept — 소비자 수락 → 매칭 확정
  router.post('/demolition-estimates/:id/accept', async (req, res) => {
    try {
      res.json(await store.accept(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  /**
   * GET /api/providers/:id/estimate-accuracy — 개산 정확도.
   * 리뷰 별점보다 강한 신호라 업체 프로필에 그대로 노출한다. 표본 수를 함께 내보내
   * 몇 건 안 되는 숫자가 단정적으로 보이지 않게 한다.
   */
  router.get('/providers/:id/estimate-accuracy', async (req, res) => {
    res.json(providerEstimateAccuracy(req.params.id, await store.listAll()));
  });

  return router;
}
