import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { ChatStore, ChatValidationError } from '../chat/store.js';

/** 인앱 채팅 API (로드맵 Phase 4). 요청 당사자만 접근 가능. */
export function createChatRouter(store: ChatStore): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof ChatValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '채팅 처리 오류' });
  }

  // POST /api/requests/:id/messages  { content } — 보낸이는 인증된 본인
  router.post('/requests/:id/messages', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const message = store.sendMessage(req.params.id, authUserId(req), body.content);
      res.status(201).json(message);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/requests/:id/messages?since= — 대화 내역 (오래된 순, since 폴링). 열람자는 인증된 본인.
  router.get('/requests/:id/messages', (req, res) => {
    const { since } = req.query;
    try {
      res.json(
        store.listMessages(req.params.id, authUserId(req), typeof since === 'string' ? since : undefined),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
