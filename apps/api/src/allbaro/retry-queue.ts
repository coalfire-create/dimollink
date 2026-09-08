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

/**
 * 재시도 큐 저장소. `CollectionPersistence<RetryQueueItem>` 이 그대로 들어맞는다 —
 * 여기서 좁혀 받는 이유는 이 모듈이 저장소 구현(JSON/PostgreSQL)을 몰라도 되게 하려는 것.
 */
export interface RetryQueuePersistence {
  list(): Promise<RetryQueueItem[]>;
  save(item: RetryQueueItem): Promise<void>;
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

/**
 * 내구성 있는 재시도 큐 — 프로세스가 재시작해도 살아남는다.
 *
 * 왜 필요한가: 인메모리 큐는 배포할 때마다 통째로 사라진다. Railway 는 푸시마다
 * 재시작하므로, 올바로 장애로 발행에 실패한 전자인계서가 **아무도 모르게 유실된다.**
 * 법정 신고 의무가 걸린 건이라 유실이 곧 미신고다.
 *
 * 왜 인메모리 맵을 그대로 들고 있는가: RetryQueue 인터페이스가 동기라 호출부(처리 루프,
 * 관리자 화면)를 전부 async 로 바꾸지 않으려면 읽기는 메모리에서 해야 한다.
 * 쓰기는 저장소로 흘려보낸다(write-through). 알림 서비스가 쓰는 것과 같은 구조다.
 *
 * ⚠️ 부팅 직후 `ready` 가 끝나기 전 짧은 구간에는 큐가 비어 보인다. 처리 루프가
 * 그때 도는 것은 무해하다 — 다음 주기에 잡힌다. 관리자 화면은 `ready` 를 기다린다.
 */
export class PersistentRetryQueue implements RetryQueue {
  private readonly items = new Map<string, RetryQueueItem>();
  /** 저장소에서 기존 항목을 다 읽어올 때까지의 약속. */
  readonly ready: Promise<void>;

  constructor(private readonly persistence: RetryQueuePersistence) {
    this.ready = (async () => {
      try {
        for (const item of await persistence.list()) this.items.set(item.id, item);
      } catch {
        // 저장소를 못 읽어도 서버는 떠야 한다 — 새 항목은 계속 쌓인다.
      }
    })();
  }

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
    this.persist(item);
    return item;
  }

  due(now: number): RetryQueueItem[] {
    return [...this.items.values()].filter(
      (it) => it.status === 'PENDING' && it.nextAttemptAt <= now,
    );
  }

  save(item: RetryQueueItem): void {
    this.items.set(item.id, item);
    this.persist(item);
  }

  all(): RetryQueueItem[] {
    return [...this.items.values()];
  }

  /**
   * 저장 실패를 삼킨다. 여기서 던지면 발행 흐름이 멈추는데, 그건 저장 실패보다 나쁘다
   * (메모리에는 남아 있어 이번 프로세스 동안은 재시도가 계속된다).
   * ⚠️ 항목에 사업자번호(PII)가 있으므로 실패 로그에 내용을 찍지 않는다.
   */
  private persist(item: RetryQueueItem): void {
    void this.persistence.save(item).catch(() => {
      console.warn(`[allbaro] 재시도 큐 저장 실패 (id=${item.id})`);
    });
  }
}
