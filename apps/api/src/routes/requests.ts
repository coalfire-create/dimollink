import {
  REQUEST_KINDS,
  isValidGeoPoint,
  type GeoPoint,
  type MatchStatus,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import { Router } from 'express';
import type { Geocoder } from '../geo/geocoder.js';
import { NoopGeocoder } from '../geo/geocoder.js';
import { authUserId } from '../middleware/auth.js';
import { RequestStore, RequestValidationError, type CreateRequestInput } from '../requests/store.js';

/** 요청 참여자(요청자 또는 매칭된 업체)인지. */
function isParticipant(request: ServiceRequest, userId: string): boolean {
  return request.requesterId === userId || request.matchedProviderId === userId;
}

/** { lat, lng } 형태만 좌표로 인정. 그 외(누락/형식오류)는 undefined. */
function parseGeoPoint(raw: unknown): GeoPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : undefined;
}

/**
 * 서비스 요청 API (철거요청/운반요청/처리장예약 · 로드맵 Phase 1 §4.2).
 * 프론트(안티그래비티 화면)가 사용하는 저장·상태 관리 엔드포인트.
 * 엔드포인트 명세: docs/api-requests.md
 */
export function createRequestsRouter(
  store: RequestStore,
  geocoder: Geocoder = new NoopGeocoder(),
): Router {
  const router = Router();

  function handleError(err: unknown, res: { status(code: number): { json(body: unknown): void } }) {
    if (err instanceof RequestValidationError) {
      const status = err.message.includes('찾을 수 없습니다') ? 404 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: '요청 처리 오류' });
  }

  /** 좌표 미제공 시 현장 주소(철거=현장, 운반=상차지)를 지오코딩해 좌표를 채운다. */
  async function resolveLocation(body: Record<string, unknown>): Promise<GeoPoint | undefined> {
    const explicit = parseGeoPoint(body.location);
    if (explicit) return explicit;
    const address =
      body.kind === 'DEMOLITION'
        ? body.siteAddress
        : body.kind === 'TRANSPORT'
          ? body.loadAddress
          : undefined;
    if (typeof address !== 'string' || address.trim() === '') return undefined;
    return (await geocoder.geocode(address)) ?? undefined;
  }

  // POST /api/requests — 요청 생성 (kind 로 3종 구분). 요청자는 인증된 본인으로 고정.
  router.post('/requests', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const location = await resolveLocation(body);
      const request = store.create({
        kind: body.kind,
        requesterId: authUserId(req),
        region: body.region,
        wasteCategory: body.wasteCategory,
        // 신규: 소재별 항목(종류+kg). 하위호환으로 wasteTons 도 함께 넘긴다(둘 다 store 에서 정규화).
        wasteItems: Array.isArray(body.wasteItems) ? (body.wasteItems as CreateRequestInput['wasteItems']) : undefined,
        wasteTons: body.wasteTons !== undefined ? Number(body.wasteTons) : undefined,
        allbaroRequested: body.allbaroRequested === true,
        sitePhotoKeys: body.sitePhotoKeys,
        location,
        siteAddress: body.siteAddress,
        loadAddress: body.loadAddress,
        unloadAddress: body.unloadAddress,
        visitAt: body.visitAt,
        linkedRequestId: typeof body.linkedRequestId === 'string' ? body.linkedRequestId : undefined,
      } as CreateRequestInput);
      res.status(201).json(request);
    } catch (err) {
      handleError(err, res);
    }
  });

  // GET /api/requests?kind=&status= — 내 요청 목록 (최신순). 요청자는 인증된 본인으로 고정.
  router.get('/requests', (req, res) => {
    const { kind, status } = req.query;
    if (kind !== undefined && !REQUEST_KINDS.includes(kind as RequestKind)) {
      res.status(400).json({ error: `kind 는 ${REQUEST_KINDS.join(' | ')} 중 하나여야 합니다.` });
      return;
    }
    res.json(
      store.list({
        requesterId: authUserId(req),
        kind: kind as RequestKind | undefined,
        status: typeof status === 'string' ? (status as MatchStatus) : undefined,
      }),
    );
  });

  // GET /api/requests/:id — 단건 조회 (참여자: 요청자 또는 매칭된 업체만)
  router.get('/requests/:id', (req, res) => {
    const request = store.get(req.params.id);
    if (!request) {
      res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
      return;
    }
    if (!isParticipant(request, authUserId(req))) {
      res.status(403).json({ error: '이 요청을 볼 권한이 없어요.' });
      return;
    }
    res.json(request);
  });

  // PATCH /api/requests/:id/status  { status, matchedProviderId?, cancelReason? }
  router.patch('/requests/:id/status', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.status !== 'string') {
      res.status(400).json({ error: 'status 가 필요합니다.' });
      return;
    }
    const existing = store.get(req.params.id);
    if (existing && !isParticipant(existing, authUserId(req))) {
      res.status(403).json({ error: '이 요청을 변경할 권한이 없어요.' });
      return;
    }
    try {
      const updated = store.changeStatus(req.params.id, body.status as MatchStatus, {
        matchedProviderId:
          typeof body.matchedProviderId === 'string' ? body.matchedProviderId : undefined,
        cancelReason: typeof body.cancelReason === 'string' ? body.cancelReason : undefined,
      });
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });

  // POST /api/requests/:id/site-photos  { keys: string[] } — 현장 사진 추가 연결
  router.post('/requests/:id/site-photos', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.keys)) {
      res.status(400).json({ error: 'keys(사진 키 배열)가 필요합니다.' });
      return;
    }
    const existing = store.get(req.params.id);
    if (existing && !isParticipant(existing, authUserId(req))) {
      res.status(403).json({ error: '이 요청을 변경할 권한이 없어요.' });
      return;
    }
    try {
      res.json(store.attachSitePhotos(req.params.id, body.keys as string[]));
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
