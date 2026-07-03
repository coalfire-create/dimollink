import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { NotificationService } from '../notifications/service.js';

/** 인앱 알림함 API (로드맵 Phase 4 · 매칭 단계별 알림). */
export function createNotificationsRouter(service: NotificationService): Router {
  const router = Router();

  // GET /api/notifications — 내 알림 목록 (최신순). 대상 사용자는 인증된 본인으로 고정.
  router.get('/notifications', (req, res) => {
    res.json(service.list({ userId: authUserId(req) }));
  });

  return router;
}
