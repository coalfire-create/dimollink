import { describe, expect, it, vi } from 'vitest';
import { OtpError, OtpService, type OtpServiceOptions, type SmsSender } from './otp-service.js';

function makeService(overrides: OtpServiceOptions = {}) {
  const sent: Array<{ phone: string; code: string }> = [];
  const sender: SmsSender = { send: (phone, code) => void sent.push({ phone, code }) };
  let now = 0;
  const service = new OtpService({
    sender,
    now: () => now,
    generateCode: () => '654321',
    ttlMs: 1000,
    maxAttempts: 3,
    verifiedWindowMs: 5000,
    ...overrides,
  });
  return { service, sent, setNow: (t: number) => (now = t) };
}

describe('OtpService', () => {
  it('코드 요청 시 발송하고 유효시간(초)을 반환', async () => {
    const { service, sent } = makeService();
    const result = await service.request('010-1111-2222');
    expect(result).toEqual({ sent: true, expiresInSec: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.code).toBe('654321');
  });

  it('올바른 코드 검증 성공 → 번호 인증 완료 상태', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    expect(service.verify('01011112222', '654321')).toBe(true);
    // 하이픈 유무와 무관하게 같은 번호로 인증 확인.
    expect(service.isPhoneVerified('010-1111-2222')).toBe(true);
  });

  it('요청 없이 검증하면 NOT_REQUESTED', () => {
    const { service } = makeService();
    expect(() => service.verify('01011112222', '654321')).toThrowError(
      expect.objectContaining({ code: 'NOT_REQUESTED' }),
    );
  });

  it('틀린 코드는 INVALID_CODE', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    expect(() => service.verify('01011112222', '000000')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CODE' }),
    );
  });

  it('만료된 코드는 EXPIRED', async () => {
    const { service, setNow } = makeService();
    await service.request('01011112222');
    setNow(2000); // ttl 1000 초과
    expect(() => service.verify('01011112222', '654321')).toThrowError(
      expect.objectContaining({ code: 'EXPIRED' }),
    );
  });

  it('시도 초과 시 TOO_MANY_ATTEMPTS 후 코드 무효화', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    for (let i = 0; i < 3; i += 1) {
      expect(() => service.verify('01011112222', '000000')).toThrow(OtpError);
    }
    // maxAttempts(3) 초과 → 무효화.
    expect(() => service.verify('01011112222', '654321')).toThrowError(
      expect.objectContaining({ code: 'TOO_MANY_ATTEMPTS' }),
    );
  });

  it('인증 창 만료 후에는 isPhoneVerified=false', async () => {
    const { service, setNow } = makeService();
    await service.request('01011112222');
    service.verify('01011112222', '654321');
    setNow(6000); // verifiedWindowMs 5000 초과
    expect(service.isPhoneVerified('01011112222')).toBe(false);
  });

  it('consumePhoneVerification 로 인증 창 소진', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    service.verify('01011112222', '654321');
    service.consumePhoneVerification('01011112222');
    expect(service.isPhoneVerified('01011112222')).toBe(false);
  });

  it('기본 코드 생성기는 6자리 숫자', async () => {
    const spy = vi.fn();
    const service = new OtpService({ sender: { send: spy } });
    await service.request('01011112222');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toMatch(/^\d{6}$/);
  });
});
