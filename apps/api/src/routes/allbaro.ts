import type { ManifestIssueRequest, ManifestParty } from '@dimol/shared';
import { Router } from 'express';
import { AllbaroClient, AllbaroError, createAllbaroClient } from '../allbaro/client.js';
import {
  ManifestService,
  getDefaultManifestService,
  getDefaultRetryQueue,
  processRetryQueue,
  toSafeQueueView,
} from '../allbaro/manifest-service.js';

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
): Router {
  const router = Router();

  // POST /api/allbaro/verify-member  { businessNumber: string }
  router.post('/allbaro/verify-member', async (req, res) => {
    const businessNumber = (req.body as { businessNumber?: unknown })?.businessNumber;
    if (typeof businessNumber !== 'string' || businessNumber.trim() === '') {
      res.status(400).json({ error: 'businessNumber(문자열)가 필요합니다.' });
      return;
    }

    try {
      res.json(await client.verifyMember(businessNumber));
    } catch (err) {
      sendAllbaroError(res, err, '회원 검증 처리 중 오류가 발생했습니다.');
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
      const summary = await processRetryQueue(client, getDefaultRetryQueue());
      res.json(summary);
    } catch (err) {
      sendAllbaroError(res, err, '재시도 큐 처리 중 오류가 발생했습니다.');
    }
  });

  // GET /api/allbaro/manifest/queue  재시도 큐 상태 조회 (PII 제외 요약)
  router.get('/allbaro/manifest/queue', (_req, res) => {
    res.json(getDefaultRetryQueue().all().map(toSafeQueueView));
  });

  return router;
}
