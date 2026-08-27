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

  // GET /api/locations/coord2address?lat=...&lng=... — 좌표 → 주소 변환(지도 핀포인트 찝기 역지오코딩)
  router.get('/locations/coord2address', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: '유효한 lat, lng 좌표가 필요합니다.' });
      return;
    }
    try {
      const result = await geocoder.reverseGeocode(lat, lng);
      if (!result) {
        res.status(444).json({ error: '해당 위치의 주소를 찾을 수 없습니다.' });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: '역지오코딩 실패' });
    }
  });

  // PUT /api/requests/:id/location  { lat, lng } — 업체 위치 갱신(업체는 인증된 본인)
  router.put('/requests/:id/location', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      res.status(400).json({ error: 'lat, lng(숫자)가 필요합니다.' });
      return;
    }
    try {
      res.json(
        await store.updateLocation(req.params.id, authUserId(req), {
          lat: body.lat,
          lng: body.lng,
        }),
      );
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/requests/:id/location — 배출자 조회. 공유 중이 아니면 { sharing: false }
  router.get('/requests/:id/location', async (req, res) => {
    try {
      const share = await store.getLocation(req.params.id);
      res.json(share ? { sharing: true, ...share } : { sharing: false });
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
