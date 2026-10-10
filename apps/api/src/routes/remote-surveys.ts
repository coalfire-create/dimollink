import { Router, type Response } from 'express';
import {
  isRemoteSurveyItemId,
  parsePhotoKeys,
  parseRemoteSurveyAnswers,
  parseRemoteSurveyItems,
  parseRemoteSurveyRooms,
} from '@dimol/shared';
import { randomUUID } from 'node:crypto';
import { authUserId } from '../middleware/auth.js';
import type { RemoteSurveyShotRequestStore } from '../remote-survey/shot-request-store.js';
import {
  RemoteSurveyError,
  type RemoteSurveyPatch,
  type RemoteSurveyStore,
} from '../remote-survey/store.js';

/**
 * 원격 실사 촬영 패키지 라우트 — 소비자가 찍어 보내고, 견적에 참여한 업체가 본다.
 *
 * 사진 자체는 기존 현장 사진 업로드(`/uploads/site-photos/presign`)로 올리고
 * 여기에는 key 만 연결한다. 규칙은 [[remote-survey]](shared)와 저장소에 있고,
 * 이 파일은 입력 형식 검증과 HTTP 응답만 맡는다.
 */
export function createRemoteSurveyRouter(
  surveys: RemoteSurveyStore,
  shotRequests: RemoteSurveyShotRequestStore,
): Router {
  const router = Router();

  function fail(err: unknown, res: Response): void {
    if (err instanceof RemoteSurveyError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // 본문에 PII(메모·주소)가 있을 수 있어 오류 내용을 응답·로그로 흘리지 않는다.
    res.status(500).json({ error: '원격 실사 처리 오류' });
  }

  // POST /api/remote-surveys  { requestId } — 만들기(이미 있으면 그대로 돌려준다)
  router.post('/remote-surveys', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const { survey, created } = await surveys.create(
        String(body.requestId ?? ''),
        authUserId(req),
      );
      res.status(created ? 201 : 200).json(survey);
    } catch (err) {
      fail(err, res);
    }
  });

  // GET /api/remote-surveys?requestId= — 소비자 본인 또는 견적 참여 업체(제출된 것만)
  router.get('/remote-surveys', async (req, res) => {
    const requestId = req.query.requestId;
    if (typeof requestId !== 'string' || !requestId) {
      res.status(400).json({ error: 'requestId 가 필요합니다.' });
      return;
    }
    try {
      res.json(await surveys.viewByRequest(requestId, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // PATCH /api/remote-surveys/:id  { rooms?, items?, answers?, scanJobId? } — 작성 중에만
  router.patch('/remote-surveys/:id', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: RemoteSurveyPatch = {};
    if (body.rooms !== undefined) {
      const parsed = parseRemoteSurveyRooms(body.rooms, randomUUID);
      if (!parsed.ok) return void res.status(400).json({ error: parsed.error });
      patch.rooms = parsed.value;
    }
    if (body.items !== undefined) {
      const parsed = parseRemoteSurveyItems(body.items);
      if (!parsed.ok) return void res.status(400).json({ error: parsed.error });
      patch.items = parsed.value;
    }
    if (body.answers !== undefined) {
      const parsed = parseRemoteSurveyAnswers(body.answers);
      if (!parsed.ok) return void res.status(400).json({ error: parsed.error });
      patch.answers = parsed.value;
    }
    if (body.scanJobId !== undefined) {
      if (
        body.scanJobId !== null &&
        !(typeof body.scanJobId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(body.scanJobId))
      ) {
        res.status(400).json({ error: '3D 스캔 정보가 올바르지 않습니다.' });
        return;
      }
      patch.scanJobId = body.scanJobId as string | null;
    }
    try {
      res.json(await surveys.update(req.params.id, authUserId(req), patch));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/remote-surveys/:id/submit — 필수가 다 찼을 때만, 참여 업체에게 알림
  router.post('/remote-surveys/:id/submit', async (req, res) => {
    try {
      res.json(await surveys.submit(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/remote-surveys/:id/shot-requests  { itemId?, message } — 업체: 더 찍어 주세요
  router.post('/remote-surveys/:id/shot-requests', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.itemId !== undefined && !isRemoteSurveyItemId(body.itemId)) {
      res.status(400).json({ error: '알 수 없는 촬영 항목입니다.' });
      return;
    }
    try {
      res.status(201).json(
        await shotRequests.create(req.params.id, authUserId(req), {
          itemId: body.itemId,
          message: typeof body.message === 'string' ? body.message : '',
        }),
      );
    } catch (err) {
      fail(err, res);
    }
  });

  // GET /api/remote-surveys/:id/shot-requests — 소비자는 전부, 업체는 자기 것만
  router.get('/remote-surveys/:id/shot-requests', async (req, res) => {
    try {
      res.json(await shotRequests.list(req.params.id, authUserId(req)));
    } catch (err) {
      fail(err, res);
    }
  });

  // POST /api/remote-surveys/shot-requests/:shotId/fulfil  { photoKeys } — 소비자: 찍어서 보내기
  router.post('/remote-surveys/shot-requests/:shotId/fulfil', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = parsePhotoKeys(body.photoKeys, '추가 사진');
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      res.json(await shotRequests.fulfil(req.params.shotId, authUserId(req), parsed.value));
    } catch (err) {
      fail(err, res);
    }
  });

  return router;
}
