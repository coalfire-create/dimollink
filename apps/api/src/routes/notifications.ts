import { Router } from 'express';
import { NotificationService } from '../notifications/service.js';

/** 인앱 알림함 API (로드맵 Phase 4 · 매칭 단계별 알림). */
export function createNotificationsRouter(service: NotificationService): Router {
  const router = Router();

  // GET /api/notifications?userId=&requestId= — 알림 목록 (최신순)
  router.get('/notifications', (req, res) => {
    const { userId, requestId } = req.query;
    if (typeof userId !== 'string' && typeof requestId !== 'string') {
      res.status(400).json({ error: 'userId 또는 requestId 필터가 필요합니다.' });
      return;
    }
    res.json(
      service.list({
        userId: typeof userId === 'string' ? userId : undefined,
        requestId: typeof requestId === 'string' ? requestId : undefined,
      }),
    );
  });

  return router;
}
