import type { IncidentStatus, IncidentType } from '@dimol/shared';
import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { ReviewStore, ReviewValidationError } from '../reviews/store.js';

/**
 * 리뷰·평점 + 노쇼/분쟁 신고 API (로드맵 Phase 2 · 신뢰 구축).
 * 인시던트 조정(RESOLVED 처리)은 Phase 5 백오피스 라우트에서만 노출한다.
 */
export function createReviewsRouter(store: ReviewStore): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof ReviewValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '리뷰 처리 오류' });
  }

  // POST /api/reviews  { requestId, raterId, rating, comment? }
  router.post('/reviews', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const review = await store.createReview({
        requestId: String(body.requestId ?? ''),
        raterId: authUserId(req),
        rating: Number(body.rating),
        comment: typeof body.comment === 'string' ? body.comment : undefined,
      });
      res.status(201).json(review);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/reviews?ratedId=&requestId= — 리뷰 목록
  router.get('/reviews', async (req, res) => {
    const { ratedId, requestId } = req.query;
    res.json(
      await store.listReviews({
        ratedId: typeof ratedId === 'string' ? ratedId : undefined,
        requestId: typeof requestId === 'string' ? requestId : undefined,
      }),
    );
  });

  // GET /api/users/:id/rating — 평점 요약 (프로필·추천 정렬용)
  router.get('/users/:id/rating', async (req, res) => {
    res.json(await store.ratingSummary(req.params.id));
  });

  // POST /api/incidents  { requestId, reporterId, type: NO_SHOW|DISPUTE, detail? }
  router.post('/incidents', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const incident = await store.reportIncident({
        requestId: String(body.requestId ?? ''),
        reporterId: authUserId(req),
        type: body.type as IncidentType,
        detail: typeof body.detail === 'string' ? body.detail : undefined,
      });
      res.status(201).json(incident);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/incidents?targetId=&status= — 신고 이력
  router.get('/incidents', async (req, res) => {
    const { targetId, status } = req.query;
    res.json(
      await store.listIncidents({
        targetId: typeof targetId === 'string' ? targetId : undefined,
        status: typeof status === 'string' ? (status as IncidentStatus) : undefined,
      }),
    );
  });

  return router;
}
