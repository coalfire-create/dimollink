import type { ManifestIssueRequest, ManifestParty } from '@dimol/shared';
import { Router } from 'express';
import { ConsoleAllbaroAdminAlerter, type AllbaroAdminAlerter } from '../allbaro/admin-alert.js';
import { AllbaroClient, AllbaroError, createAllbaroClient } from '../allbaro/client.js';
import {
  ManifestService,
  getDefaultManifestService,
  getDefaultRetryQueue,
  processRetryQueue,
  requeueForManualRetry,
  toSafeQueueView,
} from '../allbaro/manifest-service.js';
import type { RetryQueueItem } from '../allbaro/retry-queue.js';

/** AllbaroError 코드 → HTTP 상태 매핑. */
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_BUSINESS_NUMBER: 400,
  CONFIG_MISSING: 503,
  PRODUCTION_BLOCKED: 409,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
};

function sendAllbaroError(
  res: import('express').Response,
  err: unknown,
  fallbackMsg: string,
): void {
  if (err instanceof AllbaroError) {
    res.status(STATUS_BY_CODE[err.code] ?? 500).json({ error: err.message, code: err.code });
    return;
  }
  console.error(`[allbaro] ${fallbackMsg}`, err);
  res.status(500).json({ error: fallbackMsg });
}

/** 당사자 파싱 — businessNumber(문자열) 필수. 형식/체크섬 검증은 클라이언트가 수행. */
function parseParty(raw: unknown): ManifestParty | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const bn = (raw as { businessNumber?: unknown }).businessNumber;
  if (typeof bn !== 'string' || bn.trim() === '') return null;
  const name = (raw as { name?: unknown }).name;
  return { businessNumber: bn, name: typeof name === 'string' ? name : undefined };
}

function parseManifestRequest(body: unknown): ManifestIssueRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.matchRequestId !== 'string' || b.matchRequestId.trim() === '') {
    return 'matchRequestId(문자열)가 필요합니다.';
  }
  if (typeof b.wasteTons !== 'number' || !(b.wasteTons > 0)) {
    return 'wasteTons(양수)가 필요합니다.';
  }
  if (typeof b.allbaroRequested !== 'boolean') {
    return 'allbaroRequested(boolean)가 필요합니다.';
  }
  const discharger = parseParty(b.discharger);
  const transport = parseParty(b.transport);
  const disposal = parseParty(b.disposal);
  if (!discharger || !transport || !disposal) {
    return 'discharger/transport/disposal 각각 businessNumber가 필요합니다.';
  }
  return {
    matchRequestId: b.matchRequestId,
    // 파일럿은 건설폐기물만. 별도 입력을 받지 않고 고정.
    wasteCategory: 'CONSTRUCTION',
    wasteTons: b.wasteTons,
    allbaroRequested: b.allbaroRequested,
    discharger,
    transport,
    disposal,
  };
}

/**
 * 올바로 라우트 — 회원 검증 + 전자인계서 발행/재시도.
 * DI를 위해 client/service를 주입받을 수 있게 하고, 미주입 시 env 기반 기본값을 쓴다.
 */
export function createAllbaroRouter(
  client: AllbaroClient = createAllbaroClient(),
  service: ManifestService = getDefaultManifestService(client),
  adminAlerter: AllbaroAdminAlerter = new ConsoleAllbaroAdminAlerter(),
): Router {
  const router = Router();
  const onExhausted = (item: RetryQueueItem) => adminAlerter.notifyExhausted(item);

  // POST /api/allbaro/verify-member  { businessNumber: string, roleType?: 'DISCHARGER'|'TRANSPORT'|'DISPOSAL' }
  router.post('/allbaro/verify-member', async (req, res) => {
    const b = (req.body ?? {}) as { businessNumber?: unknown; roleType?: unknown };
    const businessNumber = b.businessNumber;
    if (typeof businessNumber !== 'string' || businessNumber.trim() === '') {
      res.status(400).json({ error: 'businessNumber(문자열)가 필요합니다.' });
      return;
    }
    const roleType = (b.roleType === 'TRANSPORT' || b.roleType === 'DISPOSAL' ? b.roleType : 'DISCHARGER') as 'DISCHARGER' | 'TRANSPORT' | 'DISPOSAL';

    try {
      res.json(await client.verifyMember(businessNumber, roleType));
    } catch (err) {
      sendAllbaroError(res, err, '회원 검증 처리 중 오류가 발생했습니다.');
    }
  });

  // GET /api/allbaro/notices  공지사항 목록 조회 (T100_1001_01)
  router.get('/allbaro/notices', async (_req, res) => {
    try {
      res.json(await client.getNotices());
    } catch (err) {
      sendAllbaroError(res, err, '공지사항 조회 중 오류가 발생했습니다.');
    }
  });

  // ⚠️ 아래 두 라우트는 반드시 `/manifest/:manifestNo` **앞에** 있어야 한다.
  // Express 는 등록 순서로 매칭하므로, 뒤에 두면 "queue"/"failures" 가 인계서 번호로
  // 해석돼 올바로에 조회를 날린다 — 관리자 화면이 통째로 죽는다(실제로 그랬다).
  // GET /api/allbaro/manifest/queue  재시도 큐 상태 조회 (PII 제외 요약)
  router.get('/allbaro/manifest/queue', (_req, res) => {
    res.json(getDefaultRetryQueue().all().map(toSafeQueueView));
  });

  // GET /api/allbaro/manifest/failures  재시도 소진 건 목록 (수동 재처리 대상, Phase 6)
  router.get('/allbaro/manifest/failures', (_req, res) => {
    res.json(
      getDefaultRetryQueue()
        .all()
        .filter((item) => item.status === 'EXHAUSTED')
        .map(toSafeQueueView),
    );
  });

  // GET /api/allbaro/manifest/:manifestNo  인계서 상태/상세 조회 (T200_4001_01)
  router.get('/allbaro/manifest/:manifestNo', async (req, res) => {
    const manifestNo = req.params.manifestNo;
    if (!manifestNo) {
      res.status(400).json({ error: 'manifestNo가 필요합니다.' });
      return;
    }
    try {
      res.json(await client.getManifestStatus(manifestNo));
    } catch (err) {
      sendAllbaroError(res, err, '인계서 상태 조회 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/transport-info  운반자 인수/차량 정보 등록 (T300_5001_01)
  router.post('/allbaro/transport-info', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.manifestNo !== 'string' || typeof b.vehicleNo !== 'string' || typeof b.transportedTons !== 'number' || typeof b.pickupAt !== 'string') {
      res.status(400).json({ error: 'manifestNo(문자열), vehicleNo(문자열), transportedTons(숫자), pickupAt(문자열)이 필요합니다.' });
      return;
    }
    try {
      res.json(await client.registerTransportInfo({
        manifestNo: b.manifestNo,
        vehicleNo: b.vehicleNo,
        transportedTons: b.transportedTons,
        pickupAt: b.pickupAt,
      }));
    } catch (err) {
      sendAllbaroError(res, err, '운반 정보 등록 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/disposal-info  처리자 반입/계량 정보 등록 (T400_5001_01)
  router.post('/allbaro/disposal-info', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.manifestNo !== 'string' || typeof b.weighedTons !== 'number' || typeof b.receivedAt !== 'string') {
      res.status(400).json({ error: 'manifestNo(문자열), weighedTons(숫자), receivedAt(문자열)이 필요합니다.' });
      return;
    }
    try {
      res.json(await client.registerDisposalInfo({
        manifestNo: b.manifestNo,
        weighedTons: b.weighedTons,
        receivedAt: b.receivedAt,
      }));
    } catch (err) {
      sendAllbaroError(res, err, '반입/계량 정보 등록 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/treatment-completion  처리자 최종 처리완료 등록 (T400_5001_02)
  router.post('/allbaro/treatment-completion', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.manifestNo !== 'string' || typeof b.completedAt !== 'string') {
      res.status(400).json({ error: 'manifestNo(문자열), completedAt(문자열)이 필요합니다.' });
      return;
    }
    try {
      res.json(await client.registerTreatmentCompletion({
        manifestNo: b.manifestNo,
        completedAt: b.completedAt,
        treatmentMethodCode: typeof b.treatmentMethodCode === 'string' ? b.treatmentMethodCode : undefined,
      }));
    } catch (err) {
      sendAllbaroError(res, err, '최종 처리완료 등록 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/manifest  전자인계서 발행 (ON→API, OFF→간이확인서, 장애→폴백+큐)
  router.post('/allbaro/manifest', async (req, res) => {
    const parsed = parseManifestRequest(req.body);
    if (typeof parsed === 'string') {
      res.status(400).json({ error: parsed });
      return;
    }

    try {
      res.json(await service.issue(parsed));
    } catch (err) {
      sendAllbaroError(res, err, '전자인계서 발행 처리 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/manifest/retry  재시도 큐 처리(스케줄러/운영자 트리거)
  router.post('/allbaro/manifest/retry', async (_req, res) => {
    try {
      const summary = await processRetryQueue(client, getDefaultRetryQueue(), { onExhausted });
      res.json(summary);
    } catch (err) {
      sendAllbaroError(res, err, '재시도 큐 처리 중 오류가 발생했습니다.');
    }
  });

  // GET /api/allbaro/common-codes  공통코드 조회 (T100_3001_02) — 연결 테스트 겸용
  router.get('/allbaro/common-codes', async (_req, res) => {
    try {
      res.json(await client.getCommonCodes());
    } catch (err) {
      sendAllbaroError(res, err, '공통코드 조회 중 오류가 발생했습니다.');
    }
  });

  // POST /api/allbaro/manifest/failures/:id/retry  소진 건 수동 재처리 (재적재 + 즉시 1회 시도)
  router.post('/allbaro/manifest/failures/:id/retry', async (req, res) => {
    const queue = getDefaultRetryQueue();
    try {
      requeueForManualRetry(queue, req.params.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : '수동 재처리 오류';
      res.status(message.includes('찾을 수 없습니다') ? 404 : 400).json({ error: message });
      return;
    }
    try {
      const summary = await processRetryQueue(client, queue, { onExhausted });
      const item = queue.all().find((it) => it.id === req.params.id);
      res.json({ summary, item: item ? toSafeQueueView(item) : undefined });
    } catch (err) {
      sendAllbaroError(res, err, '수동 재처리 중 오류가 발생했습니다.');
    }
  });

  return router;
}
