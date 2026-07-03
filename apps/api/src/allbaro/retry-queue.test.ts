import type { ManifestIssueRequest } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { InMemoryRetryQueue, defaultBackoffMs } from './retry-queue.js';

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
