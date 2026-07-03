import { describe, expect, it, vi } from 'vitest';
import { PortOneClient, type PortOneClientConfig } from './portone-client.js';

const testConfig: PortOneClientConfig = {
  baseUrl: 'https://api.portone.io',
  apiSecret: 'test-secret',
  storeId: 'store-1',
  mode: 'test',
  allowLive: false,
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function makeClient(fetchFn: unknown, config = testConfig): PortOneClient {
  return new PortOneClient(config, fetchFn as typeof fetch);
}

describe('PortOneClient.requestPrepayment', () => {
  it('가상계좌 기본 결제수단으로 선결제 요청', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'READY' }));
    const client = makeClient(fetchFn);

    const result = await client.requestPrepayment({ matchRequestId: 'MR-1', amount: 150_000 });

    expect(result.method).toBe('VIRTUAL_ACCOUNT');
    expect(result.amount).toBe(150_000);
    expect(result.status).toBe('READY');
    expect(result.environment).toBe('test');
    expect(result.paymentId).toContain('MR-1');

    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBe(150_000);
    expect(body.payMethod).toBe('VIRTUAL_ACCOUNT');
  });

  it('카드 결제수단 지정 가능', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'READY' }));
    const result = await makeClient(fetchFn).requestPrepayment({
      matchRequestId: 'MR-1',
      amount: 1,
      payMethod: 'CARD',
    });
    expect(result.method).toBe('CARD');
  });

  it('금액이 0 이하/비정수면 fetch 없이 INVALID_AMOUNT', async () => {
    const fetchFn = vi.fn();
    const client = makeClient(fetchFn);

    await expect(
      client.requestPrepayment({ matchRequestId: 'MR-1', amount: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(
      client.requestPrepayment({ matchRequestId: 'MR-1', amount: 1.5 }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('PortOneClient.createPayout', () => {
  it('지급대행 요청 — payoutId 멱등키 전송', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'REQUESTED' }));
    const client = makeClient(fetchFn);

    const result = await client.createPayout({
      payoutId: 'MR-1-TRANSPORT',
      party: 'TRANSPORT',
      amount: 93_000,
      businessNumber: '220-81-62517',
    });

    expect(result.status).toBe('REQUESTED');
    expect(result.amount).toBe(93_000);
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.payoutId).toBe('MR-1-TRANSPORT');
    expect(body.amount).toBe(93_000);
  });
});

describe('PortOneClient 가드/오류', () => {
  it('live 모드 + allowLive=false면 fetch 없이 LIVE_BLOCKED', async () => {
    const fetchFn = vi.fn();
    const client = makeClient(fetchFn, { ...testConfig, mode: 'live', allowLive: false });

    await expect(
      client.requestPrepayment({ matchRequestId: 'MR-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 'LIVE_BLOCKED' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('apiSecret 미설정이면 CONFIG_MISSING', async () => {
    const fetchFn = vi.fn();
    const client = makeClient(fetchFn, { ...testConfig, apiSecret: undefined });

    await expect(
      client.requestPrepayment({ matchRequestId: 'MR-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('업스트림 오류는 UPSTREAM_ERROR', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    await expect(
      makeClient(fetchFn).requestPrepayment({ matchRequestId: 'MR-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('타임아웃(AbortError)은 TIMEOUT', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchFn = vi.fn().mockRejectedValue(abortErr);
    await expect(
      makeClient(fetchFn).requestPrepayment({ matchRequestId: 'MR-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('PortOne 로그 PII 마스킹', () => {
  it('지급 실패 로그에 사업자번호 평문이 남지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));

    await expect(
      makeClient(fetchFn).createPayout({
        payoutId: 'MR-1-DISPOSAL',
        party: 'DISPOSAL',
        amount: 46_500,
        businessNumber: '220-81-62517',
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });

    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('220-81-*****');
    expect(logged).not.toContain('62517');
    warn.mockRestore();
  });
});

describe('PortOneClient.issueTaxInvoice', () => {
  it('공급가액·사업자번호로 전자세금계산서 발행', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'ISSUED' }));
    const client = makeClient(fetchFn);

    const result = await client.issueTaxInvoice({
      payoutId: 'MR-1-TRANSPORT',
      businessNumber: '1208147521',
      amount: 139_500,
    });

    expect(result.status).toBe('ISSUED');
    expect(result.taxInvoiceId).toBe('tax-MR-1-TRANSPORT');
    expect(result.environment).toBe('test');
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.supplyAmount).toBe(139_500);
    expect(body.businessNumber).toBe('1208147521');
  });

  it('금액이 0 이하면 발행 불가(INVALID_AMOUNT)', async () => {
    const fetchFn = vi.fn();
    const client = makeClient(fetchFn);
    await expect(
      client.issueTaxInvoice({ payoutId: 'x', businessNumber: '1208147521', amount: 0 }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
