import {
  estimateChecklist,
  perSquareMeter,
  perTon,
  resolveFloorArea,
  suggestedRange,
  type BuildingLedgerInfo,
  type DemolitionDetails,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

/**
 * 철거 견적 산정 근거 — 금액으로 이어지는 계산이라 유닛 테스트로 고정한다(CLAUDE.md).
 *
 * 특히 "근거가 없으면 값을 지어내지 않는다"를 지키는지가 핵심이다.
 * 없는 면적으로 제안 금액을 만들어 주면 업체가 그걸 그대로 제출하고, 실사에서 뒤집힌다.
 */

const ledger = (over: Partial<BuildingLedgerInfo> = {}): BuildingLedgerInfo => ({
  totArea: 300,
  grndFlrCnt: 3,
  ...over,
});

describe('resolveFloorArea — 연면적 근거', () => {
  it('건축물대장이 있으면 대장 연면적을 쓴다', () => {
    const area = resolveFloorArea({ buildingLedger: ledger() });
    expect(area).toEqual({ m2: 300, source: 'LEDGER', note: '건축물대장 연면적(공공데이터)' });
  });

  it('대장이 신청자 입력을 이긴다 — 대장은 확정 사실이고 입력은 기억이다', () => {
    const details: DemolitionDetails = {
      buildingLedger: ledger({ totArea: 300 }),
      spaceSize: '10평',
      floorCount: '1',
    };
    expect(resolveFloorArea(details)?.source).toBe('LEDGER');
    expect(resolveFloorArea(details)?.m2).toBe(300);
  });

  it('대장이 없으면 바닥면적(평) × 층수로 계산한다', () => {
    const area = resolveFloorArea({ spaceSize: '30평', floorCount: '지상 2층 / 지하 1층' });
    // pyeongToM2 가 소수 1자리로 끊으므로 30평 = 99.2㎡, 3개 층 → 297.6㎡.
    // (원값 297.52 와 0.1㎡ 차이 — 견적 근거로 쓰는 값이라 이 정도는 무시한다.)
    expect(area?.source).toBe('USER_INPUT');
    expect(area?.m2).toBeCloseTo(297.6, 1);
    expect(area?.note).toContain('3개 층');
  });

  it('㎡ 로 입력했으면 평으로 환산하지 않는다', () => {
    const area = resolveFloorArea({ spaceSize: '100㎡', floorCount: '2' });
    expect(area?.m2).toBe(200);
  });

  it('층수를 안 적었으면 1개 층으로 본다', () => {
    const area = resolveFloorArea({ spaceSize: '30평' });
    expect(area?.m2).toBeCloseTo(99.2, 1);
  });

  it('면적 근거가 아예 없으면 null — 값을 지어내지 않는다', () => {
    expect(resolveFloorArea(undefined)).toBeNull();
    expect(resolveFloorArea({ floorCount: '3층' })).toBeNull();
    expect(resolveFloorArea({ spaceSize: '모름' })).toBeNull();
  });
});

describe('suggestedRange — 내 단가 × 연면적', () => {
  const area = { m2: 300, source: 'LEDGER' as const, note: '' };

  it('단가와 연면적이 있으면 ±30% 범위를 만원 단위로 제안한다', () => {
    const range = suggestedRange(50_000, area);
    // 50,000 × 300 = 15,000,000 → 10,500,000 ~ 19,500,000
    expect(range).toEqual({
      minAmount: 10_500_000,
      maxAmount: 19_500_000,
      floorAreaM2: 300,
      unitPrice: 50_000,
    });
  });

  it('하단이 상단보다 작다', () => {
    const range = suggestedRange(50_000, area);
    expect(range!.minAmount).toBeLessThan(range!.maxAmount);
  });

  it('단가나 면적이 없으면 제안하지 않는다', () => {
    expect(suggestedRange(null, area)).toBeNull();
    expect(suggestedRange(undefined, area)).toBeNull();
    expect(suggestedRange(0, area)).toBeNull();
    expect(suggestedRange(-1, area)).toBeNull();
    expect(suggestedRange(50_000, null)).toBeNull();
  });

  it('아주 작은 금액도 최소 1만원 아래로 내려가지 않는다', () => {
    const tiny = suggestedRange(1, { m2: 1, source: 'LEDGER', note: '' });
    expect(tiny!.minAmount).toBe(10_000);
  });
});

describe('단가 환산', () => {
  const area = { m2: 300, source: 'LEDGER' as const, note: '' };

  it('금액을 ㎡당 단가로 나눈다', () => {
    expect(perSquareMeter(15_000_000, area)).toBe(50_000);
  });

  it('금액을 톤당 단가로 나눈다', () => {
    expect(perTon(15_000_000, 30)).toBe(500_000);
  });

  it('0 으로 나누지 않는다', () => {
    expect(perSquareMeter(15_000_000, { m2: 0, source: 'LEDGER', note: '' })).toBeNull();
    expect(perTon(15_000_000, 0)).toBeNull();
    expect(perTon(15_000_000, -5)).toBeNull();
    expect(perSquareMeter(0, area)).toBeNull();
  });
});

describe('estimateChecklist — 금액을 흔드는 항목', () => {
  it('석면 위험은 주의 항목으로 올린다', () => {
    const { caution } = estimateChecklist(undefined, {
      asbestosHigh: true,
      photoCount: 3,
      area: { m2: 300, source: 'LEDGER', note: '' },
    });
    expect(caution.join(' ')).toContain('석면');
  });

  it('진입 불가·엘리베이터 없음·지하·기계식 주차를 잡아낸다', () => {
    const { caution } = estimateChecklist(
      {
        hasVehicleAccess: false,
        hasElevator: false,
        buildingLedger: ledger({ ugrndFlrCnt: 2, mechParkingCnt: 10 }),
      },
      { asbestosHigh: false, photoCount: 1, area: { m2: 300, source: 'LEDGER', note: '' } },
    );
    const text = caution.join(' ');
    expect(text).toContain('진입');
    expect(text).toContain('엘리베이터');
    expect(text).toContain('지하 2층');
    expect(text).toContain('기계식 주차 10대');
  });

  it('조건이 모두 좋으면 주의 항목이 비어 있다', () => {
    const { caution } = estimateChecklist(
      { hasVehicleAccess: true, hasElevator: true, demolitionType: 'TOTAL' },
      { asbestosHigh: false, photoCount: 2, area: { m2: 300, source: 'LEDGER', note: '' } },
    );
    expect(caution).toHaveLength(0);
  });

  it('사진·연면적·철거 범위가 없으면 "모르는 것"으로 분리해 알린다', () => {
    const { missing } = estimateChecklist(undefined, {
      asbestosHigh: false,
      photoCount: 0,
      area: null,
    });
    expect(missing).toHaveLength(3);
    expect(missing.join(' ')).toContain('사진');
    expect(missing.join(' ')).toContain('연면적');
    expect(missing.join(' ')).toContain('철거 범위');
  });
});
