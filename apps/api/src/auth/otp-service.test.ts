import { describe, expect, it, vi } from 'vitest';
import { OtpService, type OtpServiceOptions, type SmsSender } from './otp-service.js';

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
    expect(await service.verify('01011112222', '654321')).toBe(true);
    // 하이픈 유무와 무관하게 같은 번호로 인증 확인.
    expect(await service.isPhoneVerified('010-1111-2222')).toBe(true);
  });

  it('요청 없이 검증하면 NOT_REQUESTED', async () => {
    const { service } = makeService();
    await expect(service.verify('01011112222', '654321')).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_REQUESTED' }),
    );
  });

  it('틀린 코드는 INVALID_CODE', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    await expect(service.verify('01011112222', '000000')).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_CODE' }),
    );
  });

  it('만료된 코드는 EXPIRED', async () => {
    const { service, setNow } = makeService();
    await service.request('01011112222');
    setNow(2000); // ttl 1000 초과
    await expect(service.verify('01011112222', '654321')).rejects.toThrowError(
      expect.objectContaining({ code: 'EXPIRED' }),
    );
  });

  it('시도 초과 시 TOO_MANY_ATTEMPTS 후 코드 무효화', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    for (let i = 0; i < 3; i += 1) {
      await expect(service.verify('01011112222', '000000')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_CODE' }),
      );
    }
    // maxAttempts(3) 초과 → 무효화.
    await expect(service.verify('01011112222', '654321')).rejects.toThrowError(
      expect.objectContaining({ code: 'TOO_MANY_ATTEMPTS' }),
    );
  });

  it('인증 창 만료 후에는 isPhoneVerified=false', async () => {
    const { service, setNow } = makeService();
    await service.request('01011112222');
    await service.verify('01011112222', '654321');
    setNow(6000); // verifiedWindowMs 5000 초과
    expect(await service.isPhoneVerified('01011112222')).toBe(false);
  });

  it('consumePhoneVerification 로 인증 창 소진', async () => {
    const { service } = makeService();
    await service.request('01011112222');
    await service.verify('01011112222', '654321');
    await service.consumePhoneVerification('01011112222');
    expect(await service.isPhoneVerified('01011112222')).toBe(false);
  });

  it('기본 코드 생성기는 6자리 숫자', async () => {
    const spy = vi.fn();
    const service = new OtpService({ sender: { send: spy } });
    await service.request('01011112222');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toMatch(/^\d{6}$/);
  });
});

describe('OtpService — 보안 하드닝', () => {
  it('재발송 쿨다운 내 재요청은 RESEND_COOLDOWN', async () => {
    const { service } = makeService({ resendCooldownMs: 30_000 });
    await service.request('01011112222');
    await expect(service.request('01011112222')).rejects.toThrowError(
      expect.objectContaining({ code: 'RESEND_COOLDOWN' }),
    );
  });

  it('쿨다운 경과 후에는 재발송 가능', async () => {
    const { service, setNow } = makeService({ resendCooldownMs: 30_000 });
    await service.request('01011112222');
    setNow(31_000);
    await expect(service.request('01011112222')).resolves.toEqual(
      expect.objectContaining({ sent: true }),
    );
  });

  it('devMasterCode 지정 시 해당 코드로 요청 없이도 통과', async () => {
    const { service } = makeService({ devMasterCode: '999999' });
    expect(await service.verify('01011112222', '999999')).toBe(true);
    expect(await service.isPhoneVerified('01011112222')).toBe(true);
  });

  it('devMasterCode 미지정(운영 가정)이면 마스터 우회가 없다', async () => {
    const { service } = makeService(); // devMasterCode 없음
    await expect(service.verify('01011112222', '123456')).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_REQUESTED' }),
    );
  });

  // 운영에 테스트 계정을 남겨두는 동안, 마스터코드가 실사용자 번호까지 뚫으면 안 된다.
  describe('devMasterPhones — 마스터코드 허용 번호 제한', () => {
    it('허용 목록에 있는 번호는 마스터코드로 통과한다', async () => {
      const { service } = makeService({
        devMasterCode: '123456',
        devMasterPhones: ['010-1111-0001'],
      });
      expect(await service.verify('01011110001', '123456')).toBe(true);
    });

    it('허용 목록 밖 번호는 마스터코드가 통하지 않는다(실사용자 계정 보호)', async () => {
      const { service } = makeService({
        devMasterCode: '123456',
        devMasterPhones: ['01011110001'],
      });
      await expect(service.verify('01099998888', '123456')).rejects.toThrowError(
        expect.objectContaining({ code: 'NOT_REQUESTED' }),
      );
      expect(await service.isPhoneVerified('01099998888')).toBe(false);
    });

    it('허용 목록 밖 번호도 정상 발송된 코드로는 인증된다', async () => {
      const { service } = makeService({
        devMasterCode: '123456',
        devMasterPhones: ['01011110001'],
        generateCode: () => '246810',
      });
      await service.request('01099998888');
      expect(await service.verify('01099998888', '246810')).toBe(true);
    });

    it('목록이 비면 예전처럼 모든 번호에 통한다(로컬 개발)', async () => {
      const { service } = makeService({ devMasterCode: '123456', devMasterPhones: [] });
      expect(await service.verify('01099998888', '123456')).toBe(true);
    });
  });
});
