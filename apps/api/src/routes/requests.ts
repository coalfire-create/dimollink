import {
  REQUEST_KINDS,
  isValidGeoPoint,
  type BuildingLedgerInfo,
  type BuildingType,
  type DemolitionDetails,
  type DemolitionType,
  type DimolVisionSummary,
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

/** 철거요청 상세에서 받아들이는 선택지(임의 값 저장 방지). */
const BUILDING_TYPES: readonly BuildingType[] = [
  'APARTMENT',
  'COMMERCIAL',
  'HOUSING',
  'OFFICE',
  'FACTORY',
  'OTHER',
];
const DEMOLITION_TYPES: readonly DemolitionType[] = ['TOTAL', 'INTERIOR', 'STRUCTURE'];

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

  /**
   * 철거요청 상세를 화이트리스트로 정규화한다. 사용자가 보낸 임의 필드를 그대로 저장하지 않되,
   * 폼이 채운 현장 정보·건축물대장·디몰비전 분석 결과는 요청과 함께 보관해 업체에 전달한다.
   */
  function parseDemolitionDetails(raw: unknown): DemolitionDetails | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const d = raw as Record<string, unknown>;
    const text = (v: unknown, max = 2000) =>
      typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : undefined;
    const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

    const visionRaw = d.dimolVisionAnalysis;
    let dimolVisionAnalysis: DimolVisionSummary | undefined;
    if (typeof visionRaw === 'object' && visionRaw !== null) {
      const v = visionRaw as Record<string, unknown>;
      const strings = (arr: unknown) =>
        Array.isArray(arr)
          ? arr.filter((x): x is string => typeof x === 'string').slice(0, 20)
          : undefined;
      dimolVisionAnalysis = {
        summary: text(v.summary),
        hazards: strings(v.hazards),
        materials: strings(v.materials),
        confidence: text(v.confidence, 20),
        analyzedAt: text(v.analyzedAt, 40),
      };
    }

    const ledgerRaw = d.buildingLedger;
    let buildingLedger: BuildingLedgerInfo | undefined;
    if (typeof ledgerRaw === 'object' && ledgerRaw !== null) {
      const b = ledgerRaw as Record<string, unknown>;
      buildingLedger = {
        strctCdNm: text(b.strctCdNm, 120),
        roofCdNm: text(b.roofCdNm, 120),
        etcStrct: text(b.etcStrct, 120),
        vlRatEstmTotArea: num(b.vlRatEstmTotArea),
        totArea: num(b.totArea),
        mainPurpsCdNm: text(b.mainPurpsCdNm, 120),
        grndFlrCnt: num(b.grndFlrCnt),
        ugrndFlrCnt: num(b.ugrndFlrCnt),
        useAprDay: text(b.useAprDay, 20),
        bldNm: text(b.bldNm, 120),
      };
      if (!Object.values(buildingLedger).some((v) => v !== undefined)) buildingLedger = undefined;
    }

    const details: DemolitionDetails = {
      buildingType: BUILDING_TYPES.includes(d.buildingType as BuildingType)
        ? (d.buildingType as BuildingType)
        : undefined,
      demolitionType: DEMOLITION_TYPES.includes(d.demolitionType as DemolitionType)
        ? (d.demolitionType as DemolitionType)
        : undefined,
      spaceSize: text(d.spaceSize, 60),
      floorCount: text(d.floorCount, 60),
      hasElevator: bool(d.hasElevator),
      hasVehicleAccess: bool(d.hasVehicleAccess),
      desiredDate: text(d.desiredDate, 40),
      description: text(d.description),
      dimolVisionAnalysis,
      buildingLedger,
    };
    return Object.values(details).some((v) => v !== undefined) ? details : undefined;
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
        demolitionDetails: parseDemolitionDetails(body.demolitionDetails),
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
