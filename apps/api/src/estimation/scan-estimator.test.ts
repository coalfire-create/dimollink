import {
  DEFAULT_STRIDE_M,
  DEMOLITION_TON_PER_M2,
  MIN_STEPS_FOR_SCALE,
  SCALE_SOURCE_ERROR_RATIO,
  SCALE_SOURCE_PRIORITY,
  STRIDE_TO_HEIGHT_RATIO,
  REFERENCE_STOREY_HEIGHT_M,
  WASTE_TON_PER_GROSS_M3,
  assessScanUsability,
  estimateTonsFromScan,
  impliedStoreyHeightM,
  resolveScale,
  scaleFactorFromLedgerArea,
  scaleFactorFromWalking,
  strideLengthM,
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

describe('보행 거리 스케일 — 대장 없이도 실제 치수를 잡는다', () => {
  it('걸음수 × 보폭 ÷ 복원 경로 = 길이 배율', () => {
    // 100걸음 × 0.7m = 70m 를 복원 좌표계에서 35단위로 걸었다면 배율은 2.
    expect(scaleFactorFromWalking(100, 35)).toBeCloseTo(2, 6);
  });

  it('보폭은 키에서 추정한다', () => {
    // 키 170cm → 1.70 × 0.415 ≈ 0.71m
    expect(strideLengthM(170)).toBeCloseTo(1.7 * STRIDE_TO_HEIGHT_RATIO, 2);
    // 키가 크면 보폭도 길다.
    expect(strideLengthM(185)).toBeGreaterThan(strideLengthM(160));
    // 키를 모르거나 비현실적이면 평균 보폭.
    expect(strideLengthM()).toBe(DEFAULT_STRIDE_M);
    expect(strideLengthM(50)).toBe(DEFAULT_STRIDE_M);
    expect(strideLengthM(300)).toBe(DEFAULT_STRIDE_M);
  });

  it('걸음이 너무 적으면(제자리 촬영) 쓰지 않는다', () => {
    expect(scaleFactorFromWalking(MIN_STEPS_FOR_SCALE - 1, 35)).toBeUndefined();
    expect(scaleFactorFromWalking(100, 0)).toBeUndefined();
  });
});

describe('resolveScale — 가장 정확한 근거를 고른다', () => {
  it('AR 포즈가 있으면 무조건 그것을 쓴다', () => {
    const resolved = resolveScale({
      arPoseFactor: 1.5,
      steps: 100,
      reconstructedPathLengthUnits: 35,
      reconstructedFloorAreaUnits: 25,
      ledgerTotalFloorAreaM2: 100,
    });
    expect(resolved).toEqual({ source: 'AR_POSE', factor: 1.5 });
  });

  it('AR 이 없으면 보행 거리가 대장 역산보다 우선한다', () => {
    const resolved = resolveScale({
      steps: 100,
      reconstructedPathLengthUnits: 35,
      reconstructedFloorAreaUnits: 25,
      ledgerTotalFloorAreaM2: 100,
    });
    expect(resolved.source).toBe('WALKING_DISTANCE');
    expect(resolved.factor).toBeCloseTo(2, 6);
  });

  it('걸음수가 없으면 대장 연면적으로 역산한다', () => {
    const resolved = resolveScale({
      reconstructedFloorAreaUnits: 25,
      ledgerTotalFloorAreaM2: 100,
    });
    expect(resolved.source).toBe('LEDGER_AREA');
    expect(resolved.factor).toBeCloseTo(2, 6);
  });

  it('아무 근거도 없으면 NONE — 부피를 쓸 수 없다', () => {
    expect(resolveScale({})).toEqual({ source: 'NONE' });
    // 걸음수만 있고 복원 경로가 없으면 못 쓴다.
    expect(resolveScale({ steps: 100 }).source).toBe('NONE');
  });

  it('보행 거리는 대장 역산보다 오차폭이 좁다', () => {
    expect(SCALE_SOURCE_ERROR_RATIO.WALKING_DISTANCE).toBeLessThan(
      SCALE_SOURCE_ERROR_RATIO.LEDGER_AREA,
    );
    // 다만 AR 측위보다는 넓다(보폭 개인차).
    expect(SCALE_SOURCE_ERROR_RATIO.WALKING_DISTANCE).toBeGreaterThan(
      SCALE_SOURCE_ERROR_RATIO.AR_POSE,
    );
  });

  it('우선순위 목록이 실제 오차폭 순서와 일치한다', () => {
    const ratios = SCALE_SOURCE_PRIORITY.map((s) => SCALE_SOURCE_ERROR_RATIO[s]);
    expect([...ratios]).toEqual([...ratios].sort((a, b) => a - b));
  });
});

describe('보행 거리 스케일로 산정한 물량', () => {
  it('실측으로 인정되고 대장 역산보다 범위가 좁다', async () => {
    const walking = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: { grossVolumeM3: 300, scaleSource: 'WALKING_DISTANCE', quality: GOOD_QUALITY },
    });
    const ledger = await estimator.estimate({
      floorAreaM2: 100,
      structure: 'RC',
      scan: { grossVolumeM3: 300, scaleSource: 'LEDGER_AREA', quality: GOOD_QUALITY },
    });
    expect(walking.method).toBe('SCAN_VOLUME');
    expect(walking.disclaimer).toContain('걸은 거리');
    expect(walking.rangeMaxTons - walking.rangeMinTons).toBeLessThan(
      ledger.rangeMaxTons - ledger.rangeMinTons,
    );
  });
});
