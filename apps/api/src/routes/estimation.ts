import type { BuildingStructure } from '@dimol/shared';
import { Router } from 'express';
import { EstimationValidationError, type VolumeEstimator } from '../estimation/provider.js';

/** AI 물량 산정 API (로드맵 Phase 6). 현재는 원단위 휴리스틱 목 — 응답에 한계 고지 포함. */
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
