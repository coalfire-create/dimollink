import { Router } from 'express';
import {
  isValidScanKey,
  scaleFactorFromReference,
  totalFloorAreaM2,
  type BuildingLedgerInfo,
  type ScanTarget,
} from '@dimol/shared';
import { isStorageConfigured, presignSitePhotoUpload, presignSitePhotoView } from '../storage/s3.js';
import { buildScanKeys, validateScanPresignInput } from '../scan3d/upload.js';
import type { Scan3DQueue } from '../scan3d/queue.js';
import type { Reconstructor } from '../scan3d/reconstructor.js';

/**
 * 3D 현장 스캔 API.
 *
 * 흐름: presign 으로 영상을 스토리지에 **직접** 올린 뒤(본체를 거치지 않는다 — 영상이
 * 최대 200MB 라 API 로 흘리면 서버가 죽는다), key 로 복원 잡을 만들고 폴링한다.
 * 현장 사진 분석(`site-analysis`)과 같은 잡+폴링 구조다.
 */
export function createScan3DRouter(queue: Scan3DQueue, reconstructor: Reconstructor): Router {
  const router = Router();

  // POST /api/scan3d/presign  { contentType, contentLength }
  router.post('/scan3d/presign', async (req, res) => {
    if (!isStorageConfigured()) {
      res.status(503).json({ error: '스토리지가 아직 설정되지 않았습니다. (.env 확인)' });
      return;
    }
    const validation = validateScanPresignInput(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { contentType, contentLength } = validation.value;
    try {
      const keys = buildScanKeys(contentType);
      const presigned = await presignSitePhotoUpload({
        key: keys.video,
        contentType,
        contentLength,
      });
      res.status(201).json({ ...presigned, scanId: keys.scanId });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'presign 실패' });
    }
  });

  // POST /api/scan3d/jobs  { videoKey, target, building? }
  router.post('/scan3d/jobs', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const videoKey = typeof body.videoKey === 'string' ? body.videoKey : '';
    if (!isValidScanKey(videoKey)) {
      res.status(400).json({ error: '유효한 영상 key 가 필요합니다.' });
      return;
    }
    const target: ScanTarget = body.target === 'INTERIOR' ? 'INTERIOR' : 'EXTERIOR';
    // 대장 연면적은 AR 포즈가 없을 때 스케일을 역산하는 폴백 근거다.
    const ledgerFloorAreaM2 = totalFloorAreaM2(body.building as BuildingLedgerInfo | undefined);

    const job = queue.createJob();

    // 복원은 20~40분이라 응답을 기다리지 않는다 — 잡 id 를 주고 폴링하게 한다.
    reconstructor
      .reconstruct(
        {
          jobId: job.id,
          videoKey,
          target,
          ledgerFloorAreaM2,
          hasArPose: body.hasArPose === true,
          steps: typeof body.steps === 'number' && body.steps > 0 ? body.steps : undefined,
        },
        (stage) => queue.advance(job.id, stage),
      )
      .then((result) => queue.complete(job.id, result))
      .catch((err) => {
        console.error('[scan3d] 복원 실패', err instanceof Error ? err.message : 'error');
        queue.fail(job.id, '3D 복원에 실패했습니다. 다시 촬영해 주세요.');
      });

    res.status(202).json({ jobId: job.id });
  });

  // GET /api/scan3d/jobs/:id
  router.get('/scan3d/jobs/:id', (req, res) => {
    const job = queue.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
      return;
    }
    res.json(job);
  });

  // POST /api/scan3d/jobs/:id/rescale  { realLengthM, measuredUnits }
  // 기준 물체를 3D 화면에서 잰 결과로 배율만 다시 적용한다 — 복원은 다시 돌리지 않는다.
  router.post('/scan3d/jobs/:id/rescale', (req, res) => {
    const job = queue.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
      return;
    }
    if (job.status !== 'COMPLETED' || !job.result?.rawVolumeUnits) {
      res.status(409).json({ error: '복원이 끝난 뒤에 다시 잴 수 있습니다.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const scale = scaleFactorFromReference({
      realLengthM: typeof body.realLengthM === 'number' ? body.realLengthM : NaN,
      measuredUnits: typeof body.measuredUnits === 'number' ? body.measuredUnits : NaN,
    });
    if (!scale.ok) {
      res.status(400).json({ error: scale.error });
      return;
    }

    const updated = queue.rescale(job.id, scale.factor);
    if (!updated) {
      res.status(409).json({ error: '이 작업은 다시 계산할 수 없습니다.' });
      return;
    }
    res.json(updated);
  });

  // GET /api/scan3d/scene-url?key=...  — 뷰어가 쓸 조회 URL.
  // ⚠️ 이 URL 로 받는 장면은 뷰어 페이지와 다른 오리진이라 버킷 CORS 설정이 필요하다.
  router.get('/scan3d/scene-url', async (req, res) => {
    if (!isStorageConfigured()) {
      res.status(503).json({ error: '스토리지가 아직 설정되지 않았습니다.' });
      return;
    }
    const key = req.query.key;
    if (typeof key !== 'string' || !isValidScanKey(key)) {
      res.status(400).json({ error: '유효한 스캔 key 가 필요합니다.' });
      return;
    }
    try {
      res.json(await presignSitePhotoView(key));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'presign 실패' });
    }
  });

  return router;
}
