import type { ManifestIssueRequest } from '@dimol/shared';
import { describe, expect, it, vi } from 'vitest';
import { AllbaroClient, type AllbaroClientConfig } from './client.js';
import { processRetryQueue, requeueForManualRetry } from './manifest-service.js';
import { InMemoryRetryQueue } from './retry-queue.js';

const sandboxConfig: AllbaroClientConfig = {
  baseUrl: 'https://sandbox.allbaro.example',
  apiKey: 'test-key',
  mode: 'sandbox',
  allowProduction: false,
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function makeRequest(): ManifestIssueRequest {
  return {
    matchRequestId: 'MR-1',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 6,
    allbaroRequested: true,
    discharger: { businessNumber: '220-81-62517' },
    transport: { businessNumber: '220-81-62517' },
    disposal: { businessNumber: '220-81-62517' },
  };
}

function makeClient(fetchFn: unknown): AllbaroClient {
  return new AllbaroClient(sandboxConfig, fetchFn as typeof fetch);
}

/** 소진(EXHAUSTED) 항목을 만든다: maxAttempts=1 로 적재 후 실패 1회. */
async function exhaustedItem(queue: InMemoryRetryQueue, onExhausted?: (item: unknown) => void) {
  queue.enqueue(makeRequest(), { maxAttempts: 1 });
  const failing = makeClient(vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
  await processRetryQueue(failing, queue, {
    onExhausted: onExhausted as never,
  });
  return queue.all()[0];
}

describe('processRetryQueue — 소진 시 관리자 알림 훅 (Phase 6)', () => {
  it('EXHAUSTED 전환 시 onExhausted 호출', async () => {
    const queue = new InMemoryRetryQueue();
    const alerts: unknown[] = [];
    const item = await exhaustedItem(queue, (it) => alerts.push(it));

    expect(item.status).toBe('EXHAUSTED');
    expect(alerts).toHaveLength(1);
  });

  it('알림 훅이 예외를 던져도 큐 처리는 계속된다', async () => {
    const queue = new InMemoryRetryQueue();
    const item = await exhaustedItem(queue, () => {
      throw new Error('알림 채널 장애');
    });
    expect(item.status).toBe('EXHAUSTED');
  });
});

describe('requeueForManualRetry — 수동 재처리 (Phase 6)', () => {
  it('EXHAUSTED 항목을 시도 0회·즉시 재시도 가능으로 재적재하고, 다음 처리에서 성공', async () => {
    const queue = new InMemoryRetryQueue();
    const item = await exhaustedItem(queue);

    const requeued = requeueForManualRetry(queue, item.id);
    expect(requeued.status).toBe('PENDING');
    expect(requeued.attempts).toBe(0);
    expect(requeued.lastError).toContain('MANUAL_RETRY');

    const healthy = makeClient(vi.fn().mockResolvedValue(jsonResponse({ manifestNo: 'ALB-9' })));
    const summary = await processRetryQueue(healthy, queue);
    expect(summary.succeeded).toBe(1);
    expect(queue.all()[0].status).toBe('SUCCEEDED');
    expect(queue.all()[0].manifestNo).toBe('ALB-9');
  });

  it('EXHAUSTED 아닌 항목·없는 항목은 거부', async () => {
    const queue = new InMemoryRetryQueue();
    const pending = queue.enqueue(makeRequest());
    expect(() => requeueForManualRetry(queue, pending.id)).toThrow('소진(EXHAUSTED)');
    expect(() => requeueForManualRetry(queue, 'nope')).toThrow('찾을 수 없습니다');
  });
});
