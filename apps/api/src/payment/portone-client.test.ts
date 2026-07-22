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

describe('PortOneClient 지급대행/세금계산서 — 미연동(파트너정산·B2B 필요)', () => {
  it('createPayout → NOT_CONFIGURED + 로그 사업자번호 마스킹', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      new PortOneClient(baseConfig, fakeSdk()).createPayout({
        payoutId: 'MR-1-DISPOSAL',
        party: 'DISPOSAL',
        amount: 46_500,
        businessNumber: '220-81-62517',
      }),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });

    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('220-81-*****');
    expect(logged).not.toContain('62517');
    warn.mockRestore();
  });

  it('issueTaxInvoice → NOT_CONFIGURED', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      new PortOneClient(baseConfig, fakeSdk()).issueTaxInvoice({
        payoutId: 'x',
        businessNumber: '1208147521',
        amount: 139_500,
      }),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    warn.mockRestore();
  });
});
