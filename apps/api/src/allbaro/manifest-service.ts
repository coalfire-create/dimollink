import type { ManifestIssueRequest, ManifestResult } from '@dimol/shared';
import { AllbaroClient, AllbaroError, isTransientAllbaroError } from './client.js';
import {
  InMemoryRetryQueue,
  PersistentRetryQueue,
  type RetryQueuePersistence,
  defaultBackoffMs,
  type RetryQueue,
  type RetryQueueItem,
} from './retry-queue.js';

/**
 * 전자인계서 발행 오케스트레이션.
 *
 * 규칙(CLAUDE.md 핵심 비즈니스 규칙):
 * - allbaroRequested ON  → 올바로 API 자동 발행 (ALLBARO_API)
 * - allbaroRequested OFF → 자체 간이확인서 발급 (SIMPLE_CONFIRM)
 * - ON 이지만 올바로 API 일시 장애 → 간이확인서로 폴백 발급 + 재시도 큐 적재 (RETRY_QUEUED)
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 올바로 전자인계서 발행.
 */

/** 자체 간이확인서 번호 발급. 내부 문서번호이며 올바로 관리번호와 별개. */
function issueSimpleConfirmNo(matchRequestId: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  return `SC-${stamp}-${matchRequestId}`;
}

/** 발행 결과를 요청 저장소(ServiceRequest)에 반영하는 훅. */
export type ManifestRecorder = (result: ManifestResult) => unknown;

export class ManifestService {
  constructor(
    private readonly client: AllbaroClient,
    private readonly queue: RetryQueue,
    private readonly onIssued?: ManifestRecorder,
  ) {}

  private async recordIssued(result: ManifestResult): Promise<ManifestResult> {
    if (this.onIssued) {
      try {
        await this.onIssued(result);
      } catch {
        // 요청 레코드 반영 실패가 이미 발행된 인계서 응답을 실패시키면 안 된다.
      }
    }
    return result;
  }

  async issue(request: ManifestIssueRequest): Promise<ManifestResult> {
    const issuedAt = new Date().toISOString();

    // OFF → 자체 간이확인서.
    if (!request.allbaroRequested) {
      return this.recordIssued({
        matchRequestId: request.matchRequestId,
        route: 'SIMPLE_CONFIRM',
        simpleConfirmNo: issueSimpleConfirmNo(request.matchRequestId),
        retryQueued: false,
        issuedAt,
      });
    }

    // ON → 올바로 API 자동 발행 시도.
    try {
      const api = await this.client.issueManifest(request);
      return this.recordIssued({
        matchRequestId: request.matchRequestId,
        route: 'ALLBARO_API',
        manifestNo: api.manifestNo,
        retryQueued: false,
        environment: api.environment,
        issuedAt,
      });
    } catch (err) {
      // 일시적 장애(타임아웃/업스트림)만 폴백+재시도. 그 외(설정 누락/운영차단/잘못된
      // 데이터)는 재시도해도 소용없으므로 그대로 던져 상위에서 표면화한다.
      if (err instanceof AllbaroError && isTransientAllbaroError(err.code)) {
        this.queue.enqueue(request, { reason: err.code });
        return this.recordIssued({
          matchRequestId: request.matchRequestId,
          route: 'RETRY_QUEUED',
          simpleConfirmNo: issueSimpleConfirmNo(request.matchRequestId),
          retryQueued: true,
          issuedAt,
        });
      }
      throw err;
    }
  }
}

export interface ProcessRetryOptions {
  now?: number;
  backoffMs?: (attempts: number) => number;
  /** 재시도 발행 성공 시 매칭 요청의 폴백 간이확인서를 정식 ALLBARO_API 인계서로 대체하는 훅. */
  onSucceeded?: ManifestRecorder;
  /** 재시도 소진(EXHAUSTED) 시 관리자 알림 훅 (Phase 6). 훅 오류는 큐 처리를 막지 않는다. */
  onExhausted?: (item: RetryQueueItem) => void;
}

export interface ProcessRetrySummary {
  processed: number;
  succeeded: number;
  requeued: number;
  exhausted: number;
}

/**
 * 재시도 큐의 도래한 항목을 올바로 API로 재발행 시도한다.
 * 스케줄러/크론이 주기적으로 호출하는 진입점. 실패 시 지수 백오프로 순연하고,
 * maxAttempts 초과 시 EXHAUSTED 처리(수동 개입 대상).
 */
export async function processRetryQueue(
  client: AllbaroClient,
  queue: RetryQueue,
  opts: ProcessRetryOptions = {},
): Promise<ProcessRetrySummary> {
  const now = opts.now ?? Date.now();
  const backoffMs = opts.backoffMs ?? defaultBackoffMs;
  const summary: ProcessRetrySummary = { processed: 0, succeeded: 0, requeued: 0, exhausted: 0 };

  for (const item of queue.due(now)) {
    summary.processed += 1;
    const attempts = item.attempts + 1;

    try {
      const api = await client.issueManifest(item.request);
      queue.save({ ...item, attempts, status: 'SUCCEEDED', manifestNo: api.manifestNo });
      summary.succeeded += 1;
      const record = opts.onSucceeded ?? defaultRecorder;
      if (record) {
        try {
          await record({
            matchRequestId: item.request.matchRequestId,
            route: 'ALLBARO_API',
            manifestNo: api.manifestNo,
            retryQueued: false,
            environment: api.environment,
            issuedAt: new Date(now).toISOString(),
          });
        } catch {
          // 요청 레코드 갱신 실패가 재시도 큐 완료 상태를 되돌리면 중복 발행이 된다.
        }
      }
    } catch (err) {
      const reason = err instanceof AllbaroError ? err.code : 'UNKNOWN';
      // 비일시적 오류거나 최대 시도 초과 → 소진 처리(수동 개입).
      const nonRetryable = err instanceof AllbaroError && !isTransientAllbaroError(err.code);
      if (nonRetryable || attempts >= item.maxAttempts) {
        const exhausted: RetryQueueItem = { ...item, attempts, status: 'EXHAUSTED', lastError: reason };
        queue.save(exhausted);
        summary.exhausted += 1;
        try {
          opts.onExhausted?.(exhausted);
        } catch {
          // 알림 실패가 큐 처리를 중단시키면 안 된다.
        }
      } else {
        queue.save({
          ...item,
          attempts,
          status: 'PENDING',
          nextAttemptAt: now + backoffMs(attempts),
          lastError: reason,
        });
        summary.requeued += 1;
      }
    }
  }

  return summary;
}

/**
 * 소진(EXHAUSTED)된 항목을 수동 재처리 대상으로 재적재한다 (Phase 6 · 백오피스).
 * 시도 횟수를 리셋하고 즉시 재시도 가능 상태(PENDING)로 되돌린다.
 * 실제 재발행은 다음 processRetryQueue 호출(또는 운영자 트리거)에서 일어난다.
 */
export function requeueForManualRetry(
  queue: RetryQueue,
  itemId: string,
  now: number = Date.now(),
): RetryQueueItem {
  const item = queue.all().find((it) => it.id === itemId);
  if (!item) {
    throw new Error('재시도 큐 항목을 찾을 수 없습니다.');
  }
  if (item.status !== 'EXHAUSTED') {
    throw new Error('소진(EXHAUSTED)된 항목만 수동 재처리할 수 있습니다.');
  }
  const requeued: RetryQueueItem = {
    ...item,
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: now,
    lastError: `MANUAL_RETRY(이전: ${item.lastError ?? 'UNKNOWN'})`,
  };
  queue.save(requeued);
  return requeued;
}

/** 앱 전역에서 공유하는 기본 서비스/큐 싱글턴. */
let defaultQueue: RetryQueue | undefined;
let defaultService: ManifestService | undefined;
let defaultRecorder: ManifestRecorder | undefined;

/**
 * 기본 큐를 내구성 있는 구현으로 교체한다. 앱 기동 시 **라우터를 만들기 전에** 부른다.
 *
 * 인메모리 큐는 재시작마다 통째로 사라지는데, 여기 쌓이는 건 발행에 실패한 전자인계서라
 * 유실이 곧 법정 미신고다. 저장소 구현(JSON/PostgreSQL)은 app.ts 가 정한다.
 */
export function configureDefaultRetryQueue(
  persistence: RetryQueuePersistence,
  recorder?: ManifestRecorder,
): RetryQueue {
  defaultQueue = new PersistentRetryQueue(persistence);
  defaultRecorder = recorder;
  defaultService = undefined; // 새 큐/기록기를 쓰도록 서비스도 다시 만든다.
  return defaultQueue;
}

export function getDefaultRetryQueue(): RetryQueue {
  // 설정 전(테스트 등)에는 인메모리로 동작한다 — 저장소 없이도 로직을 볼 수 있어야 한다.
  defaultQueue ??= new InMemoryRetryQueue();
  return defaultQueue;
}

export function getDefaultManifestService(client: AllbaroClient): ManifestService {
  defaultService ??= new ManifestService(client, getDefaultRetryQueue(), defaultRecorder);
  return defaultService;
}

/** 큐 항목을 PII 없이 안전하게 노출용으로 요약. */
export function toSafeQueueView(item: RetryQueueItem) {
  return {
    id: item.id,
    matchRequestId: item.request.matchRequestId,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    status: item.status,
    nextAttemptAt: new Date(item.nextAttemptAt).toISOString(),
    manifestNo: item.manifestNo,
    lastError: item.lastError,
  };
}
