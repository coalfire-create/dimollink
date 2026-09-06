import { describe, expect, it, vi } from 'vitest';
import { PortOneClient, type PortOneClientConfig, type SdkPaymentClient } from './portone-client.js';

const baseConfig: PortOneClientConfig = {
  baseUrl: 'https://api.portone.io',
  apiSecret: 'test-secret',
  storeId: 'store-1',
  mode: 'test',
  allowLive: false,
};

/** 주입용 가짜 SDK PaymentClient (기본: 15만원 PAID). */
function fakeSdk(over: Partial<SdkPaymentClient> = {}): SdkPaymentClient {
  return {
    getPayment: vi.fn().mockResolvedValue({ status: 'PAID', amount: { total: 150_000 } }),
    cancelPayment: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
    ...over,
  };
}

describe('PortOneClient.verifyPayment', () => {
  it('결제완료(PAID) + 금액 일치 → paid=true', async () => {
    const sdk = fakeSdk();
    const r = await new PortOneClient(baseConfig, sdk).verifyPayment({
      paymentId: 'p1',
      expectedAmount: 150_000,
    });
    expect(r.paid).toBe(true);
    expect(r.amount).toBe(150_000);
    expect(r.status).toBe('PAID');
    expect(sdk.getPayment).toHaveBeenCalledWith({ paymentId: 'p1' });
  });

  it('가상계좌 발급만 된 상태 → paid=false(입금 대기)', async () => {
    const sdk = fakeSdk({
      getPayment: vi
        .fn()
        .mockResolvedValue({ status: 'VIRTUAL_ACCOUNT_ISSUED', amount: { total: 150_000 } }),
    });
    const r = await new PortOneClient(baseConfig, sdk).verifyPayment({
      paymentId: 'p1',
      expectedAmount: 150_000,
    });
    expect(r.paid).toBe(false);
    expect(r.status).toBe('VIRTUAL_ACCOUNT_ISSUED');
  });

  it('결제 금액이 합의 금액과 다르면 AMOUNT_MISMATCH (위·변조 차단)', async () => {
    const sdk = fakeSdk({
      getPayment: vi.fn().mockResolvedValue({ status: 'PAID', amount: { total: 100_000 } }),
    });
    await expect(
      new PortOneClient(baseConfig, sdk).verifyPayment({ paymentId: 'p1', expectedAmount: 150_000 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
  });

  it('SDK가 PAYMENT_NOT_FOUND 던지면 PAYMENT_NOT_FOUND 로 정규화', async () => {
    const err = Object.assign(new Error('nf'), { data: { type: 'PAYMENT_NOT_FOUND' } });
    const sdk = fakeSdk({ getPayment: vi.fn().mockRejectedValue(err) });
    await expect(
      new PortOneClient(baseConfig, sdk).verifyPayment({ paymentId: 'p1', expectedAmount: 1 }),
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
  });
});

describe('PortOneClient.cancelPayment', () => {
  it('환불액만큼 취소 호출(reason 필수 전달)', async () => {
    const sdk = fakeSdk();
    const r = await new PortOneClient(baseConfig, sdk).cancelPayment({
      paymentId: 'p1',
      amount: 135_000,
      reason: '배차 후 취소',
    });
    expect(r.cancelledAmount).toBe(135_000);
    expect(sdk.cancelPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'p1', amount: 135_000, reason: '배차 후 취소' }),
    );
  });
});

describe('PortOneClient 가드', () => {
  it('live + allowLive=false → LIVE_BLOCKED (SDK 호출 없음)', async () => {
    const sdk = fakeSdk();
    await expect(
      new PortOneClient({ ...baseConfig, mode: 'live', allowLive: false }, sdk).verifyPayment({
        paymentId: 'p',
        expectedAmount: 1,
      }),
    ).rejects.toMatchObject({ code: 'LIVE_BLOCKED' });
    expect(sdk.getPayment).not.toHaveBeenCalled();
  });

  it('apiSecret·주입 클라이언트 모두 없으면 CONFIG_MISSING', async () => {
    const client = new PortOneClient({ ...baseConfig, apiSecret: undefined });
    await expect(
      client.verifyPayment({ paymentId: 'p', expectedAmount: 1 }),
    ).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });
});

describe('지급대행/세금계산서 — 모의 응답(Phase B)', () => {
    it('createPayout → SCHEDULED 상태 반환 + 로그 사업자번호 마스킹', async () => {
      const client = new PortOneClient(baseConfig, fakeSdk());
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await client.createPayout({
        payoutId: 'MR-1-DISPOSAL',
        party: 'DISPOSAL',
        amount: 46_500,
        businessNumber: '220-81-62517',
      });

      expect(result).toMatchObject({
        payoutId: 'MR-1-DISPOSAL',
        amount: 46_500,
        status: 'SCHEDULED',
      });

      const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('모의 응답');
      expect(logged).toContain('220-81-*****');
      warn.mockRestore();
    });

    it('issueTaxInvoice → ISSUED 상태 반환', async () => {
      const client = new PortOneClient(baseConfig, fakeSdk());
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await client.issueTaxInvoice({
        payoutId: 'x',
        businessNumber: '1112233333',
        amount: 139_500,
      });

      expect(result).toMatchObject({
        taxInvoiceId: 'tax-x',
        status: 'ISSUED',
      });
      warn.mockRestore();
    });
  });
