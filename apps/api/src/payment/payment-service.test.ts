import type { SettlementPlan } from '@dimol/shared';
import { describe, expect, it, vi } from 'vitest';
import { CancellationNotAllowedError } from '../settlement/refund.js';
import { PaymentService } from './payment-service.js';
import { PortOneClient, type PortOneClientConfig, type SdkPaymentClient } from './portone-client.js';

const config: PortOneClientConfig = {
  baseUrl: 'https://api.portone.io',
  apiSecret: 'test-secret',
  storeId: 'store-1',
  mode: 'test',
  allowLive: false,
};

/** 합의 금액만 필요한 테스트라 SettlementPlan 은 최소 형태로 캐스팅. */
const planOf = (prepaymentAmount: number) => ({ prepaymentAmount }) as unknown as SettlementPlan;

function makeService(over: Partial<SdkPaymentClient> = {}) {
  const sdk: SdkPaymentClient = {
    getPayment: vi.fn().mockResolvedValue({ status: 'PAID', amount: { total: 150_000 } }),
    cancelPayment: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
    ...over,
  };
  return { service: new PaymentService(new PortOneClient(config, sdk)), sdk };
}

describe('PaymentService.confirmPrepayment', () => {
  it('결제완료·금액 일치 검증 → paid=true', async () => {
    const { service } = makeService();
    const r = await service.confirmPrepayment('pay-1', planOf(150_000));
    expect(r.paid).toBe(true);
    expect(r.amount).toBe(150_000);
  });

  it('결제 금액이 합의 금액과 다르면 AMOUNT_MISMATCH', async () => {
    const { service } = makeService({
      getPayment: vi.fn().mockResolvedValue({ status: 'PAID', amount: { total: 999 } }),
    });
    await expect(service.confirmPrepayment('pay-1', planOf(150_000))).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH',
    });
  });
});

describe('PaymentService.cancel', () => {
  it('배차 전 → 전액 환불로 포트원 취소 호출', async () => {
    const { service, sdk } = makeService();
    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 150_000,
      stage: 'BEFORE_DISPATCH',
    });
    expect(breakdown.refundAmount).toBe(150_000);
    expect(cancellation?.cancelledAmount).toBe(150_000);
    expect(sdk.cancelPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 150_000 }));
  });

  it('배차 후 → 위약금 10% 제외한 환불액만 취소', async () => {
    const { service, sdk } = makeService();
    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 150_000,
      stage: 'AFTER_DISPATCH',
    });
    expect(breakdown.penaltyAmount).toBe(15_000);
    expect(cancellation?.cancelledAmount).toBe(135_000);
    expect(sdk.cancelPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 135_000 }));
  });

  it('작업 시작 후 → 포트원 호출 없이 취소 불가 예외', async () => {
    const { service, sdk } = makeService();
    await expect(
      service.cancel({ paymentId: 'pay-1', paidAmount: 150_000, stage: 'AFTER_WORK_START' }),
    ).rejects.toBeInstanceOf(CancellationNotAllowedError);
    expect(sdk.cancelPayment).not.toHaveBeenCalled();
  });

  it('환불액 0(원금 0)이면 취소 성립하되 포트원 호출 생략', async () => {
    const { service, sdk } = makeService();
    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 0,
      stage: 'BEFORE_DISPATCH',
    });
    expect(breakdown.refundAmount).toBe(0);
    expect(cancellation).toBeUndefined();
    expect(sdk.cancelPayment).not.toHaveBeenCalled();
  });
});
