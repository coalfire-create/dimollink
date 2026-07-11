import type { InteriorCategory, MatchStatus } from '@dimol/shared';
import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { InteriorStore, InteriorValidationError } from '../interior/store.js';

/**
 * 소비자 ↔ 인테리어 업체 밀봉 역경매 API (파일럿 범위 밖 · FEATURE_INTERIOR 게이트).
 *
 * 밀봉의 핵심: 입찰 목록은 항상 인증된 요청자(authUserId)를 viewer 로 넘겨 스토어가
 * 가시성을 판정한다. 클라이언트가 보낸 providerId/viewerId 를 신뢰하지 않는다
 * (업체가 남의 입찰가를 조회하는 걸 서버가 원천 차단).
 */
export function createInteriorRouter(store: InteriorStore): Router {
  const router = Router();

  function sendError(res: import('express').Response, err: unknown, fallback: string): void {
    if (err instanceof InteriorValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: fallback });
  }

  function parseCategory(raw: unknown): InteriorCategory {
    return raw === 'COMMERCIAL' ? 'COMMERCIAL' : 'RESIDENTIAL';
  }

  // POST /api/interior/requests — 소비자가 인테리어 시공 요청 등록
  router.post('/interior/requests', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const request = store.createRequest({
        requesterId: authUserId(req), // 요청자는 인증된 본인.
        region: typeof body.region === 'string' ? body.region : '',
        category: parseCategory(body.category),
        title: typeof body.title === 'string' ? body.title : '',
        description: typeof body.description === 'string' ? body.description : '',
        siteAddress: typeof body.siteAddress === 'string' ? body.siteAddress : '',
        budget: body.budget === undefined ? undefined : Number(body.budget),
        photoKeys: Array.isArray(body.photoKeys)
          ? body.photoKeys.filter((k): k is string => typeof k === 'string')
          : undefined,
      });
      res.status(201).json(request);
    } catch (err) {
      sendError(res, err, '인테리어 요청 처리 오류');
    }
  });

  // GET /api/interior/requests?scope=mine|open&status= — 요청 목록
  // - mine(기본): 내가 발주한 요청. - open: 아직 대기중(REQUESTED)인 공개 일감(업체 입찰용).
  router.get('/interior/requests', (req, res) => {
    const me = authUserId(req);
    const scope = req.query.scope === 'open' ? 'open' : 'mine';
    if (scope === 'open') {
      res.json(store.listRequests({ status: 'REQUESTED' }));
      return;
    }
    const status = typeof req.query.status === 'string' ? (req.query.status as MatchStatus) : undefined;
    res.json(store.listRequests({ requesterId: me, status }));
  });

  // GET /api/interior/requests/:id — 요청 상세 (일감 공고. 입찰가는 별도 밀봉 조회)
  router.get('/interior/requests/:id', (req, res) => {
    const request = store.getRequest(req.params.id);
    if (!request) {
      res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      return;
    }
    res.json(request);
  });

  // POST /api/interior/requests/:id/bids — 인테리어 업체가 밀봉 입찰 제출
  router.post('/interior/requests/:id/bids', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const bid = store.submitBid({
        requestId: req.params.id,
        providerId: authUserId(req), // 입찰 업체는 인증된 본인.
        amount: Number(body.amount),
        memo: typeof body.memo === 'string' ? body.memo : undefined,
      });
      res.status(201).json(bid);
    } catch (err) {
      sendError(res, err, '입찰 처리 오류');
    }
  });

  // GET /api/interior/requests/:id/bids — 밀봉 입찰 목록
  // viewer = 인증된 본인. 요청자면 전체, 업체면 자기 입찰만, 그 외 빈 목록(스토어가 판정).
  router.get('/interior/requests/:id/bids', (req, res) => {
    res.json(store.listBids(req.params.id, authUserId(req)));
  });

  // POST /api/interior/bids/:id/accept — 소비자(요청자 본인)가 입찰 낙찰 → 매칭 확정
  router.post('/interior/bids/:id/accept', (req, res) => {
    try {
      res.json(store.acceptBid(req.params.id, authUserId(req)));
    } catch (err) {
      sendError(res, err, '낙찰 처리 오류');
    }
  });

  return router;
}
