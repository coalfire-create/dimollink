import type { BuildingStructure, ScanScaleSource } from '@dimol/shared';
import { Router } from 'express';
import { EstimationValidationError, type VolumeEstimator } from '../estimation/provider.js';
import type { ScanMeasurement } from '../estimation/scan-estimator.js';

/**
 * AI 물량 산정 API (로드맵 Phase 6).
 *
 * `scan` 을 함께 주면 3D 실측 부피로 산정하고(층고·증축부 반영), 없거나 품질 게이트를
 * 통과하지 못하면 연면적 원단위로 폴백한다([[scan-estimator]]). 응답의 `method` 로
 * 어느 쪽이 쓰였는지 구분된다.
 */
export function createEstimationRouter(estimator: VolumeEstimator): Router {
  const router = Router();

  // POST /api/estimation/volume  { floorAreaM2, floors?, structure?, sitePhotoKeys? }
  router.post('/estimation/volume', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const estimate = await estimator.estimate({
        floorAreaM2: typeof body.floorAreaM2 === 'number' ? body.floorAreaM2 : undefined,
        floors: typeof body.floors === 'number' ? body.floors : undefined,
        structure:
          typeof body.structure === 'string' ? (body.structure as BuildingStructure) : undefined,
        sitePhotoKeys: Array.isArray(body.sitePhotoKeys)
          ? body.sitePhotoKeys.filter((k): k is string => typeof k === 'string')
          : undefined,
        scan: parseScan(body.scan),
      });
      res.json(estimate);
    } catch (err) {
      if (err instanceof EstimationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '물량 추정 처리 오류' });
    }
  });

  return router;
}

/**
 * 클라이언트가 넘긴 3D 스캔 실측값을 화이트리스트로 정규화한다.
 * 품질 지표가 하나라도 빠지면 스캔을 쓰지 않는다 — 게이트를 통과시킬 근거가 없으면
 * 실측이라고 주장할 수 없다.
 */
function parseScan(raw: unknown): ScanMeasurement | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const s = raw as Record<string, unknown>;
  const quality = s.quality as Record<string, unknown> | undefined;
  if (
    typeof s.grossVolumeM3 !== 'number' ||
    !Number.isFinite(s.grossVolumeM3) ||
    typeof quality !== 'object' ||
    quality === null ||
    typeof quality.registeredRatio !== 'number' ||
    typeof quality.pointCount !== 'number' ||
    typeof quality.watertight !== 'boolean'
  ) {
    return undefined;
  }
  return {
    grossVolumeM3: s.grossVolumeM3,
    scaleSource: parseScaleSource(s.scaleSource),
    quality: {
      registeredRatio: quality.registeredRatio,
      pointCount: quality.pointCount,
      watertight: quality.watertight,
    },
  };
}

/** 알 수 없는 값은 NONE — 모르면 부피를 쓰지 않는 쪽이 안전하다. */
function parseScaleSource(value: unknown): ScanScaleSource {
  return value === 'AR_POSE' || value === 'REFERENCE_OBJECT' || value === 'LEDGER_AREA'
    ? value
    : 'NONE';
}
