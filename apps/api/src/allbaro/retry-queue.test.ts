import type { ManifestIssueRequest } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import {
  InMemoryRetryQueue,
  PersistentRetryQueue,
  defaultBackoffMs,
  type RetryQueueItem,
} from './retry-queue.js';

function makeRequest(): ManifestIssueRequest {
  return {
    matchRequestId: 'MR-1',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 6,
    allbaroRequested: true,
    discharger: { businessNumber: '2208162517' },
    transport: { businessNumber: '2208162517' },
    disposal: { businessNumber: '2208162517' },
  };
}

describe('InMemoryRetryQueue', () => {
  it('enqueue한 항목은 PENDING이고 기본 maxAttempts를 가진다', () => {
    const q = new InMemoryRetryQueue();
    const item = q.enqueue(makeRequest(), { now: 1_000, reason: 'UPSTREAM_ERROR' });

    expect(item.status).toBe('PENDING');
    expect(item.attempts).toBe(0);
    expect(item.maxAttempts).toBe(5);
    expect(item.lastError).toBe('UPSTREAM_ERROR');
    expect(q.all()).toHaveLength(1);
  });

  it('due는 nextAttemptAt이 도래한 PENDING만 반환', () => {
    const q = new InMemoryRetryQueue();
    q.enqueue(makeRequest(), { now: 0, firstDelayMs: 0 }); // 즉시
    q.enqueue(makeRequest(), { now: 0, firstDelayMs: 10_000 }); // 미래

    expect(q.due(0)).toHaveLength(1);
    expect(q.due(10_000)).toHaveLength(2);
  });

  it('save로 상태를 갱신하면 due에서 제외된다', () => {
    const q = new InMemoryRetryQueue();
    const item = q.enqueue(makeRequest(), { now: 0 });
    q.save({ ...item, status: 'SUCCEEDED' });

    expect(q.due(0)).toHaveLength(0);
    expect(q.all()[0]?.status).toBe('SUCCEEDED');
  });
});

describe('defaultBackoffMs', () => {
  it('지수 백오프: 1→60s, 2→120s, 3→240s', () => {
    expect(defaultBackoffMs(1)).toBe(60_000);
    expect(defaultBackoffMs(2)).toBe(120_000);
    expect(defaultBackoffMs(3)).toBe(240_000);
  });
});

describe('PersistentRetryQueue — 재시작해도 살아남는다', () => {
  /** 저장소 목. 실패를 주입할 수 있게 한다. */
  function fakeStore(seed: RetryQueueItem[] = []) {
    const rows = new Map(seed.map((i) => [i.id, i]));
    return {
      rows,
      failSave: false,
      list: async () => [...rows.values()],
      save: async function (item: RetryQueueItem) {
        if (this.failSave) throw new Error('DB 장애');
        rows.set(item.id, item);
      },
    };
  }

  const REQUEST = makeRequest();

  it('enqueue 한 항목이 저장소에 남는다', async () => {
    const store = fakeStore();
    const queue = new PersistentRetryQueue(store);
    await queue.ready;
    const item = queue.enqueue(REQUEST, { reason: 'TIMEOUT' });
    await Promise.resolve(); // write-through 는 비동기다.
    expect(store.rows.get(item.id)?.status).toBe('PENDING');
  });

  it('재시작해도 큐가 복원된다 — 이게 이 클래스의 존재 이유다', async () => {
    const store = fakeStore();
    const first = new PersistentRetryQueue(store);
    await first.ready;
    const item = first.enqueue(REQUEST);
    await Promise.resolve();

    // 프로세스 재시작 = 같은 저장소로 새 인스턴스.
    const second = new PersistentRetryQueue(store);
    await second.ready;
    expect(second.all().map((i) => i.id)).toEqual([item.id]);
    expect(second.due(Date.now())).toHaveLength(1);
  });

  it('save 로 바뀐 상태도 저장된다', async () => {
    const store = fakeStore();
    const queue = new PersistentRetryQueue(store);
    await queue.ready;
    const item = queue.enqueue(REQUEST);
    await Promise.resolve();

    queue.save({ ...item, status: 'SUCCEEDED', manifestNo: 'MN-1' });
    await Promise.resolve();
    expect(store.rows.get(item.id)?.status).toBe('SUCCEEDED');

    const restarted = new PersistentRetryQueue(store);
    await restarted.ready;
    // 성공한 건은 재시작 후 다시 시도되지 않아야 한다 — 중복 발행이 된다.
    expect(restarted.due(Date.now())).toHaveLength(0);
  });

  it('저장이 실패해도 발행 흐름을 멈추지 않는다', async () => {
    const store = fakeStore();
    store.failSave = true;
    const queue = new PersistentRetryQueue(store);
    await queue.ready;
    expect(() => queue.enqueue(REQUEST)).not.toThrow();
    // 메모리에는 남아 이번 프로세스 동안은 재시도가 계속된다.
    expect(queue.all()).toHaveLength(1);
  });

  it('저장소를 못 읽어도 서버는 뜬다', async () => {
    const queue = new PersistentRetryQueue({
      list: async () => {
        throw new Error('DB 장애');
      },
      save: async () => undefined,
    });
    await expect(queue.ready).resolves.toBeUndefined();
    expect(queue.all()).toEqual([]);
  });
});
