import { describe, expect, it, vi } from 'vitest';
import { CancellationNotAllowedError } from '../settlement/refund.js';
import { PaymentService } from './payment-service.js';
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

function makeService(fetchFn: unknown): PaymentService {
  return new PaymentService(new PortOneClient(testConfig, fetchFn as typeof fetch));
}

describe('PaymentService.cancel', () => {
  it('배차 전 → 전액 환불로 포트원 취소 호출', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'CANCELLED' }));
    const service = makeService(fetchFn);

    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 150_000,
      stage: 'BEFORE_DISPATCH',
    });

    expect(breakdown.refundAmount).toBe(150_000);
    expect(cancellation?.cancelledAmount).toBe(150_000);
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBe(150_000); // 환불액만 취소
  });

  it('배차 후 → 위약금 10% 제외한 환불액만 취소', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ status: 'CANCELLED' }));
    const service = makeService(fetchFn);

    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 150_000,
      stage: 'AFTER_DISPATCH',
    });

    expect(breakdown.penaltyAmount).toBe(15_000);
    expect(cancellation?.cancelledAmount).toBe(135_000);
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.amount).toBe(135_000);
  });

  it('작업 시작 후 → 포트원 호출 없이 취소 불가 예외', async () => {
    const fetchFn = vi.fn();
    const service = makeService(fetchFn);

    await expect(
      service.cancel({ paymentId: 'pay-1', paidAmount: 150_000, stage: 'AFTER_WORK_START' }),
    ).rejects.toBeInstanceOf(CancellationNotAllowedError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('환불액 0(원금 0)이면 취소 성립하되 포트원 호출 생략', async () => {
    const fetchFn = vi.fn();
    const service = makeService(fetchFn);

    const { breakdown, cancellation } = await service.cancel({
      paymentId: 'pay-1',
      paidAmount: 0,
      stage: 'BEFORE_DISPATCH',
    });

    expect(breakdown.refundAmount).toBe(0);
    expect(cancellation).toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
