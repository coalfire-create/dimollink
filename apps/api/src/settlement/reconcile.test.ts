import { describe, expect, it } from 'vitest';
import { buildSettlementPlan } from './plan.js';
import { reconcileSettlement, type ActualPayout } from './reconcile.js';

// 운반비 300만 + 처리비 700만 = 총 1,000만, 수수료 7% = 70만
// 지급: 운반 279만, 처리 651만 / 완료일 2026-07-01(수) → 정산일 2026-07-02(목)
function plan() {
  return buildSettlementPlan({
    transportFee: 3_000_000,
    disposalFee: 7_000_000,
    completedDate: '2026-07-01',
  });
}

function exactPayouts(): ActualPayout[] {
  const p = plan();
  return p.payouts.map((instruction) => ({
    party: instruction.party,
    amount: instruction.amount,
    paidDate: p.settlementDate,
  }));
}

describe('reconcileSettlement — 정산 대사', () => {
  it('플랜대로 지급되면 matched', () => {
    const result = reconcileSettlement(plan(), exactPayouts());
    expect(result.matched).toBe(true);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('지급 누락 검출 (당사자별)', () => {
    const [transportOnly] = exactPayouts();
    const result = reconcileSettlement(plan(), [transportOnly]);
    expect(result.matched).toBe(false);
    expect(result.discrepancies).toEqual([
      expect.objectContaining({ kind: 'MISSING_PAYOUT', party: 'DISPOSAL', actualAmount: 0 }),
    ]);
  });

  it('금액 불일치 검출 (기대/실제 금액 포함)', () => {
    const actuals = exactPayouts();
    actuals[0] = { ...actuals[0], amount: actuals[0].amount - 1_000 };
    const result = reconcileSettlement(plan(), actuals);
    expect(result.discrepancies).toEqual([
      expect.objectContaining({
        kind: 'AMOUNT_MISMATCH',
        party: 'TRANSPORT',
        expectedAmount: 2_790_000,
        actualAmount: 2_789_000,
      }),
    ]);
  });

  it('중복 지급 검출 (합계가 맞아도 건수 2건이면 불일치)', () => {
    const [transport, disposal] = exactPayouts();
    const half = { ...transport, amount: transport.amount / 2 };
    const result = reconcileSettlement(plan(), [half, half, disposal]);
    expect(result.discrepancies).toEqual([
      expect.objectContaining({ kind: 'DUPLICATE_PAYOUT', party: 'TRANSPORT' }),
    ]);
  });

  it('지급일이 D+1 영업일과 다르면 DATE_MISMATCH', () => {
    const actuals = exactPayouts();
    actuals[1] = { ...actuals[1], paidDate: '2026-07-03' };
    const result = reconcileSettlement(plan(), actuals);
    expect(result.discrepancies).toEqual([
      expect.objectContaining({
        kind: 'DATE_MISMATCH',
        party: 'DISPOSAL',
        expectedDate: '2026-07-02',
        actualDate: '2026-07-03',
      }),
    ]);
  });

  it('지급일 미보고(paidDate 없음)는 날짜 대사를 건너뛴다', () => {
    const actuals = exactPayouts().map(({ party, amount }) => ({ party, amount }));
    expect(reconcileSettlement(plan(), actuals).matched).toBe(true);
  });

  it('플랜 내부 정합성 위반 검출 (수수료+지급총액 ≠ 선결제 총액)', () => {
    const broken = plan();
    broken.payouts[0] = { ...broken.payouts[0], amount: broken.payouts[0].amount + 1 };
    const result = reconcileSettlement(broken, exactPayouts());
    expect(result.discrepancies).toContainEqual(
      expect.objectContaining({ kind: 'PLAN_INCONSISTENT' }),
    );
  });

  it('불일치가 여러 건이면 모두 보고한다', () => {
    const result = reconcileSettlement(plan(), [
      { party: 'TRANSPORT', amount: 1_000_000, paidDate: '2026-07-03' },
    ]);
    const kinds = result.discrepancies.map((d) => d.kind).sort();
    expect(kinds).toEqual(['AMOUNT_MISMATCH', 'DATE_MISMATCH', 'MISSING_PAYOUT']);
  });
});
