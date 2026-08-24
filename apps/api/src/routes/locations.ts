import { Router } from 'express';
import { authUserId } from '../middleware/auth.js';
import { LocationStore, LocationValidationError } from '../locations/store.js';
import { createGeocoder, type Geocoder } from '../geo/geocoder.js';

/** 실시간 위치 공유 및 카카오 주소 검색 API. */
export function createLocationsRouter(
  store: LocationStore,
  geocoder: Geocoder = createGeocoder(),
): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof LocationValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '위치 공유 처리 오류' });
  }

  // GET /api/locations/search-address?query=... — 주소/건물명 검색 (카카오 연동)
  router.get('/locations/search-address', async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    try {
      const results = await geocoder.searchAddress(query);
      res.json(results);
    } catch {
      res.status(500).json({ error: '주소 검색 실패' });
    }
  });

  // PUT /api/requests/:id/location  { lat, lng } — 업체 위치 갱신(업체는 인증된 본인)
  router.put('/requests/:id/location', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      res.status(400).json({ error: 'lat, lng(숫자)가 필요합니다.' });
      return;
    }
    try {
      res.json(
        store.updateLocation(req.params.id, authUserId(req), {
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
