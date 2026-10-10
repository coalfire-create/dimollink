import {
  DEMOLITION_MEMBERSHIP_ID,
  MEMBERSHIP_PASS_DAYS,
  PASS_REFUND_WINDOW_DAYS,
  passCoversDate,
} from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassRefundService, type PassRefundError } from './pass-refund.js';
import { PassStore } from './pass-store.js';

/**
 * 이용권 환불 — 돈이 나가는 경로라 판정을 유닛 테스트로 못 박는다(CLAUDE.md 민감 영역).
 *
 * 정책: 결제 후 7일 이내 · 혜택 미사용 · 가장 최근 이용권 → 전액 환불.
 * PG 취소가 성공한 뒤에만 이용권을 환불 처리한다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const PRICE = 5_900;

let passes: PassStore;
let cancelPayment: ReturnType<typeof vi.fn>;
let usedSince: ReturnType<typeof vi.fn>;
let service: PassRefundService;

beforeEach(() => {
  // 결제 시각(createdAt)이 실행 날짜에 따라 달라지지 않게 고정한다.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T03:00:00.000Z'));
  passes = new PassStore();
  cancelPayment = vi.fn(async () => ({}));
  usedSince = vi.fn(async () => false);
  service = new PassRefundService(passes, { cancelPayment } as never, { usedSince });
});

afterEach(() => {
  vi.useRealTimers();
});

const buy = (paymentId: string, today = '2026-10-07', userId = 'user-1') =>
  passes.grant({
    userId,
    productId: DEMOLITION_MEMBERSHIP_ID,
    paymentId,
    amount: PRICE,
    days: MEMBERSHIP_PASS_DAYS,
    today,
  });

/** 결제 시각 + ms 뒤의 시각. */
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms);

async function refundError(promise: Promise<unknown>): Promise<PassRefundError> {
  try {
    await promise;
  } catch (err) {
    return err as PassRefundError;
  }
  throw new Error('환불이 거절되지 않았습니다.');
}

describe('이용권 환불 — 허용', () => {
  it('7일 이내·혜택 미사용이면 결제액 전액을 PG 취소하고 이용권을 환불 처리한다', async () => {
    const pass = await buy('pay_1');
    const refunded = await service.refund(pass.id, 'user-1', after(pass.createdAt, DAY_MS));

    expect(cancelPayment).toHaveBeenCalledTimes(1);
    expect(cancelPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay_1', amount: PRICE }),
    );
    expect(refunded.refundedAmount).toBe(PRICE);
    expect(refunded.refundedAt).toBeDefined();
    expect((await passes.get(pass.id))!.refundedAt).toBe(refunded.refundedAt);
  });

  it('환불한 이용권은 그 기간에도 혜택을 주지 않는다', async () => {
    const pass = await buy('pay_1');
    const refunded = await service.refund(pass.id, 'user-1', after(pass.createdAt, 1000));
    expect(passCoversDate(pass, pass.startDate)).toBe(true);
    expect(passCoversDate(refunded, refunded.startDate)).toBe(false);
  });

  it('정확히 7일째까지는 환불된다(경계)', async () => {
    const pass = await buy('pay_1');
    await service.refund(pass.id, 'user-1', after(pass.createdAt, PASS_REFUND_WINDOW_DAYS * DAY_MS));
    expect(cancelPayment).toHaveBeenCalledTimes(1);
  });

  it('혜택 사용 여부는 결제 시각 이후 기록만 본다', async () => {
    const pass = await buy('pay_1');
    await service.refund(pass.id, 'user-1', after(pass.createdAt, 1000));
    expect(usedSince).toHaveBeenCalledWith('user-1', pass.createdAt);
  });

  it('환불 뒤 다시 사면 환불한 기간을 건너뛰지 않고 오늘부터 시작한다', async () => {
    const pass = await buy('pay_1', '2026-10-07');
    await service.refund(pass.id, 'user-1', after(pass.createdAt, 1000));
    const again = await buy('pay_2', '2026-10-08');
    expect(again.startDate).toBe('2026-10-08');
  });
});

describe('이용권 환불 — 거절(PG 취소를 부르지 않는다)', () => {
  it('결제 후 7일이 지나면 WINDOW_PASSED', async () => {
    const pass = await buy('pay_1');
    const err = await refundError(
      service.refund(pass.id, 'user-1', after(pass.createdAt, PASS_REFUND_WINDOW_DAYS * DAY_MS + 1)),
    );
    expect(err.code).toBe('WINDOW_PASSED');
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('혜택을 썼으면 BENEFIT_USED', async () => {
    usedSince.mockResolvedValue(true);
    const pass = await buy('pay_1');
    const err = await refundError(service.refund(pass.id, 'user-1', after(pass.createdAt, 1000)));
    expect(err.code).toBe('BENEFIT_USED');
    expect(cancelPayment).not.toHaveBeenCalled();
    expect((await passes.get(pass.id))!.refundedAt).toBeUndefined();
  });

  it('이미 환불했으면 ALREADY_REFUNDED — 두 번 취소하지 않는다', async () => {
    const pass = await buy('pay_1');
    await service.refund(pass.id, 'user-1', after(pass.createdAt, 1000));
    const err = await refundError(service.refund(pass.id, 'user-1', after(pass.createdAt, 2000)));
    expect(err.code).toBe('ALREADY_REFUNDED');
    expect(cancelPayment).toHaveBeenCalledTimes(1);
  });

  it('남의 이용권이면 NOT_FOUND', async () => {
    const pass = await buy('pay_1');
    const err = await refundError(service.refund(pass.id, 'user-2', after(pass.createdAt, 1000)));
    expect(err.code).toBe('NOT_FOUND');
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('PG 취소가 실패하면 이용권을 환불 처리하지 않는다', async () => {
    cancelPayment.mockRejectedValue(new Error('PG 오류'));
    const pass = await buy('pay_1');
    await expect(service.refund(pass.id, 'user-1', after(pass.createdAt, 1000))).rejects.toThrow(
      'PG 오류',
    );
    expect((await passes.get(pass.id))!.refundedAt).toBeUndefined();
  });
});

describe('이용권 환불 — 이어 산 이용권', () => {
  it('뒤에 이어 산 이용권이 있으면 앞의 이용권은 NEWER_PASS_EXISTS', async () => {
    const first = await buy('pay_1', '2026-10-07');
    await buy('pay_2', '2026-10-07');
    const err = await refundError(service.refund(first.id, 'user-1', after(first.createdAt, 1000)));
    expect(err.code).toBe('NEWER_PASS_EXISTS');
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('가장 최근 이용권은 환불되고, 혜택 사용은 그 이용권 시작일부터 본다', async () => {
    await buy('pay_1', '2026-10-07');
    const second = await buy('pay_2', '2026-10-07');
    expect(second.startDate).toBe('2026-11-06');

    await service.refund(second.id, 'user-1', after(second.createdAt, 1000));
    // 앞 이용권 기간에 받은 우선 알림은 뒤 이용권의 혜택 사용이 아니다.
    expect(usedSince).toHaveBeenCalledWith('user-1', '2026-11-05T15:00:00.000Z');
    expect(cancelPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'pay_2' }));
  });

  it('뒤 이용권을 환불한 뒤에는 앞 이용권도 환불할 수 있다', async () => {
    const first = await buy('pay_1', '2026-10-07');
    const second = await buy('pay_2', '2026-10-07');
    await service.refund(second.id, 'user-1', after(second.createdAt, 1000));
    await service.refund(first.id, 'user-1', after(first.createdAt, 2000));
    expect(cancelPayment).toHaveBeenCalledTimes(2);
  });
});
