import type { WasteCategory } from '@dimol/shared';
import { Router } from 'express';
import { MatchRequestStore, MatchRequestValidationError } from '../matching/request-store.js';

/**
 * 매칭요청 라우트 (파일럿: 인메모리 저장 — DB 연동 시 저장 구현 교체).
 * 철거요청/처리장예약 UI 에서 업로드한 현장 사진 키(sitePhotoKeys)를
 * 매칭요청 데이터에 연결해 저장한다.
 */
export function createMatchRequestsRouter(store: MatchRequestStore = new MatchRequestStore()): Router {
  const router = Router();

  // POST /api/match-requests
  // { dischargerId, region, wasteCategory, wasteTons, allbaroRequested, sitePhotoKeys? }
  router.post('/match-requests', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const request = store.create({
        dischargerId: String(body.dischargerId ?? ''),
        region: String(body.region ?? ''),
        wasteCategory: body.wasteCategory as WasteCategory,
        wasteTons: Number(body.wasteTons),
        allbaroRequested: body.allbaroRequested === true,
        sitePhotoKeys: body.sitePhotoKeys as string[] | undefined,
      });
      res.status(201).json(request);
    } catch (err) {
      if (err instanceof MatchRequestValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '매칭요청 처리 오류' });
    }
  });

  // GET /api/match-requests/:id
  router.get('/match-requests/:id', (req, res) => {
    const request = store.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: '매칭요청을 찾을 수 없습니다.' });
      return;
    }
    res.json(request);
  });

  // POST /api/match-requests/:id/site-photos  { keys: string[] }  (사후 첨부)
  router.post('/match-requests/:id/site-photos', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.keys)) {
      res.status(400).json({ error: 'keys(사진 키 배열)가 필요합니다.' });
      return;
    }
    try {
      res.json(store.attachSitePhotos(req.params.id, body.keys as string[]));
    } catch (err) {
      if (err instanceof MatchRequestValidationError) {
        const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '사진 연결 처리 오류' });
    }
  });

  return router;
}
