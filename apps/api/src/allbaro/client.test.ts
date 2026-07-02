import { describe, expect, it, vi } from 'vitest';
import { AllbaroClient, AllbaroError, type AllbaroClientConfig } from './client.js';

const VALID = '220-81-62517';

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

describe('AllbaroClient.verifyMember', () => {
  it('정규화된(하이픈 제거) 사업자번호로 호출하고 결과를 매핑한다', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ verified: true, memberName: '테스트운반', memberType: 'TRANSPORT' }),
      );
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const result = await client.verifyMember(VALID);

    expect(result.verified).toBe(true);
    expect(result.memberName).toBe('테스트운반');
    expect(result.memberType).toBe('TRANSPORT');
    expect(result.environment).toBe('sandbox');
    expect(result.businessNumber).toBe('2208162517');

    // 요청 본문에 하이픈 없는 정규화 값이 담겨야 한다.
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.businessNumber).toBe('2208162517');
  });

  it('형식/체크섬 불량이면 fetch 호출 없이 INVALID_BUSINESS_NUMBER', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember('123')).rejects.toMatchObject({
      code: 'INVALID_BUSINESS_NUMBER',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('운영 모드에서 allowProduction=false면 fetch 없이 PRODUCTION_BLOCKED', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, mode: 'production', allowProduction: false },
      fetchFn as unknown as typeof fetch,
    );

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'PRODUCTION_BLOCKED' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('baseUrl/apiKey 미설정이면 CONFIG_MISSING', async () => {
    const fetchFn = vi.fn();
    const client = new AllbaroClient(
      { ...sandboxConfig, apiKey: undefined },
      fetchFn as unknown as typeof fetch,
    );

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('업스트림 4xx/5xx는 UPSTREAM_ERROR', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('AbortError(타임아웃)는 TIMEOUT', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchFn = vi.fn().mockRejectedValue(abortErr);
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    await expect(client.verifyMember(VALID)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('알 수 없는 memberType은 UNKNOWN으로 매핑', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ verified: true, memberType: 'ZZZ' }));
    const client = new AllbaroClient(sandboxConfig, fetchFn as unknown as typeof fetch);

    const result = await client.verifyMember(VALID);
    expect(result.memberType).toBe('UNKNOWN');
  });

  it('AllbaroError는 Error 인스턴스이고 code를 가진다', () => {
    const e = new AllbaroError('TIMEOUT', 'x');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('TIMEOUT');
  });
});
