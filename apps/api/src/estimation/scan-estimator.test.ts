import {
  DEMOLITION_TON_PER_M2,
  REFERENCE_STOREY_HEIGHT_M,
  WASTE_TON_PER_GROSS_M3,
  assessScanUsability,
  estimateTonsFromScan,
  impliedStoreyHeightM,
  scaleFactorFromLedgerArea,
  type Scan3DQuality,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { HeuristicVolumeEstimator } from './provider.js';
import { ScanVolumeEstimator } from './scan-estimator.js';

const GOOD_QUALITY: Scan3DQuality = {
  registeredRatio: 0.95,
  pointCount: 250_000,
  watertight: true,
};

const estimator = new ScanVolumeEstimator(new HeuristicVolumeEstimator());

describe('부피 원단위 — 면적 원단위와 정합', () => {
  it('기준 층고 3m 에서 두 방법이 같은 답을 낸다', () => {
    // 연면적 100㎡ RC → 면적 원단위 158톤
    const byArea = 100 * DEMOLITION_TON_PER_M2;
    // 같은 건물의 외피 부피 = 100㎡ × 3m = 300㎥
    const byVolume = 100 * REFERENCE_STOREY_HEIGHT_M * WASTE_TON_PER_GROSS_M3.RC;
    expect(byVolume).toBeCloseTo(byArea, 6);
  });

  it('층고가 높으면 부피 산정이 더 크게 나온다(면적 원단위가 못 보는 것)', () => {
    const normal = estimateTonsFromScan({
      grossVolumeM3: 300, structure: 'RC', scaleSource: 'AR_POSE', quality: GOOD_QUALITY,
    });
    const highCeiling = estimateTonsFromScan({
      grossVolumeM3: 450, structure: 'RC', scaleSource: 'AR_POSE', quality: GOOD_QUALITY,
    });
    expect(highCeiling.estimatedTons).toBeGreaterThan(normal.estimatedTons);
  });

  it('구조에 따라 부피 원단위가 다르다', () => {
    expect(WASTE_TON_PER_GROSS_M3.RC).toBeGreaterThan(WASTE_TON_PER_GROSS_M3.BRICK);
    expect(WASTE_TON_PER_GROSS_M3.BRICK).toBeGreaterThan(WASTE_TON_PER_GROSS_M3.WOOD);
  });
});

describe('assessScanUsability — 나쁜 스캔은 쓰지 않는다', () => {
  it('정렬률이 낮으면 재촬영을 안내한다', () => {
    const { usable, reasons } = assessScanUsability(
      { ...GOOD_QUALITY, registeredRatio: 0.4 }, 'AR_POSE',
    );
    expect(usable).toBe(false);
    expect(reasons.join()).toContain('다시 촬영');
  });

  it('점군이 성기면(무늬 없는 벽면) 거른다', () => {
    const { usable } = assessScanUsability({ ...GOOD_QUALITY, pointCount: 500 }, 'AR_POSE');
    expect(usable).toBe(false);
  });

  it('스케일 근거가 없으면 부피를 쓸 수 없다', () => {
    const { usable, reasons } = assessScanUsability(GOOD_QUALITY, 'NONE');
    expect(usable).toBe(false);
    expect(reasons.join()).toContain('치수');
  });

  it('외형이 뚫려 있으면 부피가 작게 나온다고 알린다', () => {
    const { usable, reasons } = assessScanUsability(
      { ...GOOD_QUALITY, watertight: false }, 'AR_POSE',
    );
    expect(usable).toBe(false);
    expect(reasons.join()).toContain('뚫린');
  });

  it('좋은 스캔은 사유 없이 통과', () => {
    expect(assessScanUsability(GOOD_QUALITY, 'AR_POSE')).toEqual({ usable: true, reasons: [] });
  });
});

describe('오차폭은 스케일 출처가 정한다', () => {
  it('AR 측위가 대장 역산보다 범위가 좁다', () => {
    const ar = estimateTonsFromScan({
      grossVolumeM3: 300, structure: 'RC', scaleSource: 'AR_POSE', quality: GOOD_QUALITY,
    });
    const ledger = estimateTonsFromScan({
      grossVolumeM3: 300, structure: 'RC', scaleSource: 'LEDGER_AREA', quality: GOOD_QUALITY,
    });
    const arWidth = ar.rangeMaxTons - ar.rangeMinTons;
    const ledgerWidth = ledger.rangeMaxTons - ledger.rangeMinTons;
    expect(arWidth).toBeLessThan(ledgerWidth);
  });
});

describe('ScanVolumeEstimator — 폴백 규약', () => {
  it('스캔이 없으면 원단위 추정기로 위임한다', async () => {
    const result = await estimator.estimate({ floorAreaM2: 100, structure: 'RC' });
    expect(result.method).toBe('AREA_HEURISTIC');
  });

  it('좋은 스캔이면 실측 부피로 산정한다', async () => {
    const result = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: { grossVolumeM3: 300, scaleSource: 'AR_POSE', quality: GOOD_QUALITY },
    });
    expect(result.method).toBe('SCAN_VOLUME');
    expect(result.confidence).toBe('HIGH');
    expect(result.disclaimer).toContain('300㎥');
    // 층고 3m 이므로 면적 원단위(158톤)와 거의 같아야 한다.
    expect(result.estimatedTons).toBeCloseTo(158, 0);
  });

  it('나쁜 스캔이면 원단위로 폴백하고 이유를 고지한다', async () => {
    const result = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: {
        grossVolumeM3: 300,
        scaleSource: 'AR_POSE',
        quality: { ...GOOD_QUALITY, registeredRatio: 0.2 },
      },
    });
    // "실측"이라는 이름값에 속지 않는다 — 나쁜 스캔은 통계 추정보다 나쁘다.
    expect(result.method).toBe('AREA_HEURISTIC');
    expect(result.disclaimer).toContain('3D 스캔 실측은 사용하지 못했습니다');
  });

  it('스캔 부피가 대장 연면적보다 크면(증축부) 물량도 커진다', async () => {
    const ledgerOnly = await estimator.estimate({ floorAreaM2: 100, structure: 'RC' });
    // 대장 100㎡(=300㎥ 상당)인데 실제로는 증축으로 400㎥ 였던 경우.
    const scanned = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: { grossVolumeM3: 400, scaleSource: 'AR_POSE', quality: GOOD_QUALITY },
    });
    expect(scanned.estimatedTons).toBeGreaterThan(ledgerOnly.estimatedTons);
  });

  it('부피가 0 이면 폴백한다', async () => {
    const result = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: { grossVolumeM3: 0, scaleSource: 'AR_POSE', quality: GOOD_QUALITY },
    });
    expect(result.method).toBe('AREA_HEURISTIC');
  });
});

describe('스케일 역산·층고 유도', () => {
  it('대장 연면적으로 길이 배율을 구한다(면적비의 제곱근)', () => {
    // 복원 좌표계 바닥면적 25단위² 가 실제 100㎡ 라면 길이 배율은 2.
    expect(scaleFactorFromLedgerArea(25, 100)).toBeCloseTo(2, 6);
  });

  it('입력이 이상하면 undefined', () => {
    expect(scaleFactorFromLedgerArea(0, 100)).toBeUndefined();
    expect(scaleFactorFromLedgerArea(25, 0)).toBeUndefined();
  });

  it('스캔 부피로 평균 층고를 역산한다', () => {
    expect(impliedStoreyHeightM(450, 100)).toBe(4.5);
    expect(impliedStoreyHeightM(0, 100)).toBeUndefined();
  });
});
