import { isValidSitePhotoKey } from '@dimol/shared';
import { Router } from 'express';
import {
  isStorageConfigured,
  presignSitePhotoUpload,
  presignSitePhotoView,
} from '../storage/s3.js';
import { buildSitePhotoKey, validatePresignInput } from '../storage/site-photo.js';

/**
 * 현장 사진 업로드 라우트 (철거요청/처리장예약 UI · 로드맵 Phase 1 §4.2).
 * 앱은 여기서 presigned URL 을 받아 스토리지에 직접 업로드하고,
 * 발급받은 key 를 매칭요청(POST /api/match-requests)에 연결한다.
 */
export function createUploadsRouter(): Router {
  const router = Router();

  // POST /api/uploads/site-photos/presign  { purpose, contentType, contentLength }
  router.post('/uploads/site-photos/presign', async (req, res) => {
    if (!isStorageConfigured()) {
      res.status(503).json({ error: '사진 스토리지가 아직 설정되지 않았습니다. (.env 확인)' });
      return;
    }
    const validation = validatePresignInput(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { purpose, contentType, contentLength } = validation.value;
    try {
      const key = buildSitePhotoKey(purpose, contentType);
      const presigned = await presignSitePhotoUpload({ key, contentType, contentLength });
      res.status(201).json(presigned);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'presign 실패' });
    }
  });

  // GET /api/uploads/site-photos/view-url?key=...  (매칭요청 상세의 사진 표시용)
  router.get('/uploads/site-photos/view-url', async (req, res) => {
    if (!isStorageConfigured()) {
      res.status(503).json({ error: '사진 스토리지가 아직 설정되지 않았습니다. (.env 확인)' });
      return;
    }
    const key = req.query.key;
    if (typeof key !== 'string' || !isValidSitePhotoKey(key)) {
      res.status(400).json({ error: '유효한 사진 key 가 필요합니다.' });
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
