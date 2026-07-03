import type { ManifestIssueRequest } from '@dimol/shared';

/**
 * 올바로 API 장애 시 전자인계서 재발행을 위한 재시도 큐.
 *
 * ⚠️ 현재는 인메모리 구현(프로세스 재시작 시 유실). 운영에서는 반드시 내구성 있는
 *   저장소(PostgreSQL 테이블 또는 잡 큐)로 교체한다. 그래서 아래 RetryQueue 인터페이스에
 *   맞춰 구현을 분리해 뒀다.
 * ⚠️ 큐 항목에는 사업자번호(PII)가 포함되므로 로그로 덤프하지 않는다.
 */

export type RetryStatus = 'PENDING' | 'SUCCEEDED' | 'EXHAUSTED';

export interface RetryQueueItem {
  id: string;
  request: ManifestIssueRequest;
  attempts: number;
  maxAttempts: number;
  /** 다음 시도 가능 시각(epoch ms). */
  nextAttemptAt: number;
  status: RetryStatus;
  /** 성공 시 발급된 올바로 인계서 번호. */
  manifestNo?: string;
  /** 마지막 실패 사유(코드/요약). PII 미포함. */
  lastError?: string;
}

export interface EnqueueOptions {
  maxAttempts?: number;
  /** 최초 재시도까지의 지연(ms). 기본 즉시(0) — 처리기가 백오프로 순연. */
  firstDelayMs?: number;
  now?: number;
  reason?: string;
}

export interface RetryQueue {
  enqueue(request: ManifestIssueRequest, opts?: EnqueueOptions): RetryQueueItem;
  /** now 시점에 재시도 가능한 PENDING 항목. */
  due(now: number): RetryQueueItem[];
  /** 처리 결과 반영(변경된 항목 저장). */
  save(item: RetryQueueItem): void;
  all(): RetryQueueItem[];
}

const DEFAULT_MAX_ATTEMPTS = 5;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `rq_${Date.now().toString(36)}_${seq}`;
}

/** 인메모리 재시도 큐. 테스트/파일럿용 — 운영 전 내구성 저장소로 교체. */
export class InMemoryRetryQueue implements RetryQueue {
  private readonly items = new Map<string, RetryQueueItem>();

  enqueue(request: ManifestIssueRequest, opts: EnqueueOptions = {}): RetryQueueItem {
    const now = opts.now ?? Date.now();
    const item: RetryQueueItem = {
      id: nextId(),
      request,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: now + (opts.firstDelayMs ?? 0),
      status: 'PENDING',
      lastError: opts.reason,
    };
    this.items.set(item.id, item);
    return item;
  }

  due(now: number): RetryQueueItem[] {
    return [...this.items.values()].filter(
      (it) => it.status === 'PENDING' && it.nextAttemptAt <= now,
    );
  }

  save(item: RetryQueueItem): void {
    this.items.set(item.id, item);
  }

  all(): RetryQueueItem[] {
    return [...this.items.values()];
  }
}

/** 지수 백오프(ms): 60s * 2^(attempts-1). 기본값이며 주입으로 교체 가능. */
export function defaultBackoffMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, attempts - 1);
}
