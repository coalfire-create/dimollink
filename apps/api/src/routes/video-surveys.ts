import { Router, type Response } from 'express';
import { authUserId } from '../middleware/auth.js';
import { VideoSurveyError, type VideoSurveyService } from '../video-survey/service.js';

/**
 * 영상통화 실사 API (로드맵 Phase 4 · 커뮤니케이션 강화).
 * HTTP 처리만 한다 — 권한·순서는 [[service]], 판정은 shared [[video-survey]].
 */
export function createVideoSurveyRouter(service: VideoSurveyService): Router {
  const router = Router();

  function fail(err: unknown, res: Response): void {
    if (err instanceof VideoSurveyError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '영상통화 처리 오류' });
  }

  const body = (req: { body?: unknown }) => (req.body ?? {}) as Record<string, unknown>;

  // GET /api/requests/:id/video-surveys → { sessions, testMode }
  router.get('/requests/:id/video-surveys', async (req, res) => {
    try {
      res.json({
        sessions: await service.list(req.params.id, authUserId(req)),
        testMode: service.testMode,
      });
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/requests/:id/video-surveys  { proposedAt: ISO[] } — 업체가 통화 요청 + 시간 제안
  router.post('/requests/:id/video-surveys', async (req, res) => {
    try {
      res
        .status(201)
        .json(await service.request(req.params.id, authUserId(req), body(req).proposedAt));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/video-surveys/:id/accept  { scheduledAt } — 요청자가 시간 선택 → 예약
  router.post('/video-surveys/:id/accept', async (req, res) => {
    try {
      res.json(await service.accept(req.params.id, authUserId(req), body(req).scheduledAt));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/video-surveys/:id/join → { url, testMode, closesAt, session } — 당사자·입장 시간만
  router.post('/video-surveys/:id/join', async (req, res) => {
    try {
      // 입장 링크에는 토큰이 들어 있다 — 캐시에 남지 않게 한다.
      res.setHeader('Cache-Control', 'no-store');
      res.json(await service.join(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/video-surveys/:id/end — 통화 종료(통화 시간 기록)
  router.post('/video-surveys/:id/end', async (req, res) => {
    try {
      res.json(await service.end(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/video-surveys/:id/cancel — 예약 전·후 취소
  router.post('/video-surveys/:id/cancel', async (req, res) => {
    try {
      res.json(await service.cancel(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  return router;
}
