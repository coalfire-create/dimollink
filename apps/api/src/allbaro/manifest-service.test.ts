import type { ManifestIssueRequest } from '@dimol/shared';
import { describe, expect, it, vi } from 'vitest';
import { AllbaroClient, type AllbaroClientConfig } from './client.js';
import { ManifestService, processRetryQueue } from './manifest-service.js';
import { InMemoryRetryQueue } from './retry-queue.js';

const sandboxConfig: AllbaroClientConfig = {
  baseUrl: 'https://sandbox.allbaro.example',
  apiCertKey: 'test-cert-key',
  companyCode: '254269674',
  userId: '254269674',
  password: 'allbarosys',
  mode: 'sandbox',
  allowProduction: false,
  timeoutMs: 5_000,
};

// 올바로 API 표준 응답 (resultCode '0000' + dataList)
function allbaroManifestResponse(manfNum: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({
      ifid: 'T200_5001_01',
      txid: 'T200_5001_01-20260728-0001',
      resultCode: '0000',
      resultMessage: '정상',
      errorMessage: null,
      dataList: [{ manf_num: manfNum }],
    }),
  } as unknown as Response;
}

function allbaroErrorResponse(resultCode = '9999', ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({
      ifid: 'T200_5001_01',
      resultCode,
      resultMessage: '오류',
      errorMessage: `오류코드 ${resultCode}`,
      dataList: [],
    }),
  } as unknown as Response;
}

function httpErrorResponse(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

function abortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

function makeRequest(allbaroRequested: boolean): ManifestIssueRequest {
  return {
    matchRequestId: 'MR-1',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 6,
    allbaroRequested,
    discharger: { businessNumber: '220-81-62517' },
    transport: { businessNumber: '220-81-62517' },
    disposal: { businessNumber: '220-81-62517' },
  };
}

function makeClient(fetchFn: unknown): AllbaroClient {
  return new AllbaroClient(sandboxConfig, fetchFn as typeof fetch);
}

describe('ManifestService.issue', () => {
  it('OFF → 간이확인서(SIMPLE_CONFIRM), API 호출 없음', async () => {
    const fetchFn = vi.fn();
    const queue = new InMemoryRetryQueue();
    const service = new ManifestService(makeClient(fetchFn), queue);

    const result = await service.issue(makeRequest(false));

    expect(result.route).toBe('SIMPLE_CONFIRM');
    expect(result.simpleConfirmNo).toMatch(/^SC-/);
    expect(result.manifestNo).toBeUndefined();
    expect(result.retryQueued).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(queue.all()).toHaveLength(0);
  });

  it('ON + 성공 → 올바로 자동발행(ALLBARO_API)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroManifestResponse('ALB-2026-0001'));
    const queue = new InMemoryRetryQueue();
    const service = new ManifestService(makeClient(fetchFn), queue);

    const result = await service.issue(makeRequest(true));

    expect(result.route).toBe('ALLBARO_API');
    expect(result.manifestNo).toBe('ALB-2026-0001');
    expect(result.retryQueued).toBe(false);
    expect(result.environment).toBe('sandbox');
    expect(queue.all()).toHaveLength(0);
  });

  it('ON + 업스트림 장애 → 간이확인서 폴백 + 재시도 큐 적재(RETRY_QUEUED)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(httpErrorResponse(500));
    const queue = new InMemoryRetryQueue();
    const service = new ManifestService(makeClient(fetchFn), queue);

    const result = await service.issue(makeRequest(true));

    expect(result.route).toBe('RETRY_QUEUED');
    expect(result.simpleConfirmNo).toMatch(/^SC-/);
    expect(result.retryQueued).toBe(true);
    expect(queue.all()).toHaveLength(1);
    expect(queue.all()[0]?.status).toBe('PENDING');
  });

  it('ON + 타임아웃 → 폴백 + 큐 적재', async () => {
    const fetchFn = vi.fn().mockRejectedValue(abortError());
    const queue = new InMemoryRetryQueue();
    const service = new ManifestService(makeClient(fetchFn), queue);

    const result = await service.issue(makeRequest(true));

    expect(result.route).toBe('RETRY_QUEUED');
    expect(queue.all()).toHaveLength(1);
  });

  it('ON + 비일시적 오류(PRODUCTION_BLOCKED)는 폴백 없이 예외 전파', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, mode: 'production', allowProduction: false } as AllbaroClientConfig,
      fetchFn as unknown as typeof fetch,
    );
    const queue = new InMemoryRetryQueue();
    const service = new ManifestService(client, queue);

    await expect(service.issue(makeRequest(true))).rejects.toMatchObject({
      code: 'PRODUCTION_BLOCKED',
    });
    expect(queue.all()).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('processRetryQueue', () => {
  it('도래한 항목 재발행 성공 → SUCCEEDED + manifestNo', async () => {
    const fetchFn = vi.fn().mockResolvedValue(allbaroManifestResponse('ALB-RETRY-1'));
    const queue = new InMemoryRetryQueue();
    queue.enqueue(makeRequest(true), { now: 0 });

    const summary = await processRetryQueue(makeClient(fetchFn), queue, { now: 1 });

    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });
    const item = queue.all()[0];
    expect(item?.status).toBe('SUCCEEDED');
    expect(item?.manifestNo).toBe('ALB-RETRY-1');
    expect(item?.attempts).toBe(1);
  });

  it('일시 장애 + 시도 여유 → PENDING 재적재, 백오프로 순연', async () => {
    const fetchFn = vi.fn().mockResolvedValue(httpErrorResponse(503));
    const queue = new InMemoryRetryQueue();
    queue.enqueue(makeRequest(true), { now: 0, maxAttempts: 3 });

    const summary = await processRetryQueue(makeClient(fetchFn), queue, {
      now: 100,
      backoffMs: () => 5_000,
    });

    expect(summary).toMatchObject({ processed: 1, requeued: 1 });
    const item = queue.all()[0];
    expect(item?.status).toBe('PENDING');
    expect(item?.attempts).toBe(1);
    expect(item?.nextAttemptAt).toBe(5_100); // now(100) + backoff(5000)
    // 순연됐으므로 같은 시각엔 더 이상 due 아님.
    expect(queue.due(100)).toHaveLength(0);
  });

  it('최대 시도 초과 → EXHAUSTED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(httpErrorResponse(500));
    const queue = new InMemoryRetryQueue();
    const item = queue.enqueue(makeRequest(true), { now: 0, maxAttempts: 1 });
    // 이미 0회 → 이번 시도가 1회째이자 마지막.
    void item;

    const summary = await processRetryQueue(makeClient(fetchFn), queue, { now: 1 });

    expect(summary).toMatchObject({ processed: 1, exhausted: 1 });
    expect(queue.all()[0]?.status).toBe('EXHAUSTED');
  });

  it('비일시적 오류는 즉시 EXHAUSTED', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, apiCertKey: undefined } as AllbaroClientConfig, // CONFIG_MISSING (비일시적)
      fetchFn as unknown as typeof fetch,
    );
    const queue = new InMemoryRetryQueue();
    queue.enqueue(makeRequest(true), { now: 0, maxAttempts: 5 });

    const summary = await processRetryQueue(client, queue, { now: 1 });

    expect(summary).toMatchObject({ processed: 1, exhausted: 1 });
    expect(queue.all()[0]?.status).toBe('EXHAUSTED');
  });

  it('아직 도래하지 않은 항목은 건너뛴다', async () => {
    const fetchFn = vi.fn();
    const queue = new InMemoryRetryQueue();
    queue.enqueue(makeRequest(true), { now: 0, firstDelayMs: 10_000 });

    const summary = await processRetryQueue(makeClient(fetchFn), queue, { now: 1 });

    expect(summary.processed).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
