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

function isParticipant(request: ServiceRequest, userId: string): boolean {
  return request.requesterId === userId || request.matchedProviderId === userId;
}

function parseGeoPoint(raw: unknown): GeoPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  const point = { lat, lng };
  return isValidGeoPoint(point) ? point : undefined;
}

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

  router.post('/requests', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const location = await resolveLocation(body);
      const request = await store.create({
        kind: body.kind,
        requesterId: authUserId(req),
        region: body.region,
        wasteCategory: body.wasteCategory,
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

  router.get('/requests', async (req, res) => {
    const { kind, status } = req.query;
    if (kind !== undefined && !REQUEST_KINDS.includes(kind as RequestKind)) {
      res.status(400).json({ error: `kind 는 ${REQUEST_KINDS.join(' | ')} 중 하나여야 합니다.` });
      return;
    }
    try {
      const requests = await store.list({
        requesterId: authUserId(req),
        kind: kind as RequestKind | undefined,
        status: typeof status === 'string' ? (status as MatchStatus) : undefined,
      });
      res.json(requests);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/requests/:id', async (req, res) => {
    try {
      const request = await store.get(req.params.id);
      if (!request) {
        res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
        return;
      }
      if (!isParticipant(request, authUserId(req))) {
        res.status(403).json({ error: '이 요청을 볼 권한이 없어요.' });
        return;
      }
      res.json(request);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.patch('/requests/:id/status', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.status !== 'string') {
      res.status(400).json({ error: 'status 가 필요합니다.' });
      return;
    }
    try {
      const existing = await store.get(req.params.id);
      if (existing && !isParticipant(existing, authUserId(req))) {
        res.status(403).json({ error: '이 요청을 변경할 권한이 없어요.' });
        return;
      }
      const updated = await store.changeStatus(req.params.id, body.status as MatchStatus, {
        matchedProviderId:
          typeof body.matchedProviderId === 'string' ? body.matchedProviderId : undefined,
        cancelReason: typeof body.cancelReason === 'string' ? body.cancelReason : undefined,
      });
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post('/requests/:id/site-photos', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(body.keys)) {
      res.status(400).json({ error: 'keys(사진 키 배열)가 필요합니다.' });
      return;
    }
    try {
      const existing = await store.get(req.params.id);
      if (existing && !isParticipant(existing, authUserId(req))) {
        res.status(403).json({ error: '이 요청을 변경할 권한이 없어요.' });
        return;
      }
      const updated = await store.attachSitePhotos(req.params.id, body.keys as string[]);
      res.json(updated);
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
