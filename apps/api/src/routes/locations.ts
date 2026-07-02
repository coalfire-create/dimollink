import { Router } from 'express';
import { LocationStore, LocationValidationError } from '../locations/store.js';

/** 실시간 위치 공유 API (로드맵 Phase 4). 작업 진행중(IN_PROGRESS)에만 동작. */
export function createLocationsRouter(store: LocationStore): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof LocationValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '위치 공유 처리 오류' });
  }

  // PUT /api/requests/:id/location  { providerId, lat, lng } — 업체 위치 갱신
  router.put('/requests/:id/location', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      res.status(400).json({ error: 'lat, lng(숫자)가 필요합니다.' });
      return;
    }
    try {
      res.json(
        store.updateLocation(req.params.id, String(body.providerId ?? ''), {
          lat: body.lat,
          lng: body.lng,
        }),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/requests/:id/location — 배출자 조회. 공유 중이 아니면 { sharing: false }
  router.get('/requests/:id/location', (req, res) => {
    try {
      const share = store.getLocation(req.params.id);
      res.json(share ? { sharing: true, ...share } : { sharing: false });
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
