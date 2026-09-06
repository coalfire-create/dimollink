import {
  MIN_SCAN_FRAMES,
  MIN_SELECTION_SURPLUS,
  RECOMMENDED_SCAN_SECONDS,
  SCAN_3D_STAGE_WEIGHTS,
  SCAN_EXTRACT_FPS,
  TARGET_SCAN_FRAMES,
  assessScanDuration,
  expectedFrameCount,
  scan3DProgress,
  type Scan3DStage,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

describe('추출 fps — 흐림 선별이 실제로 작동해야 한다', () => {
  it('권장 촬영 시간이면 선별 여유가 생긴다', () => {
    // 이전 설계(3fps)에서는 30초=90장, 목표 이하라 전부 통과 → 흐림 필터가 무력했다.
    for (const secs of [RECOMMENDED_SCAN_SECONDS.min, RECOMMENDED_SCAN_SECONDS.max]) {
      const { frames, hasSelectionSurplus } = assessScanDuration(secs);
      expect(frames / TARGET_SCAN_FRAMES).toBeGreaterThanOrEqual(MIN_SELECTION_SURPLUS);
      expect(hasSelectionSurplus).toBe(true);
    }
  });

  it('최소 권장 시간에서 목표 장수를 넘긴다', () => {
    expect(expectedFrameCount(RECOMMENDED_SCAN_SECONDS.min)).toBeGreaterThan(TARGET_SCAN_FRAMES);
  });

  it('추출 fps 는 목표 장수를 만들 만큼 충분히 높다', () => {
    // 30초 × fps ≥ 목표 × 여유배수 여야 선별이 의미를 갖는다.
    expect(RECOMMENDED_SCAN_SECONDS.min * SCAN_EXTRACT_FPS).toBeGreaterThanOrEqual(
      TARGET_SCAN_FRAMES * MIN_SELECTION_SURPLUS,
    );
  });
});

describe('assessScanDuration — 촬영 중 판정', () => {
  it('너무 짧으면 복원 불가로 알린다', () => {
    const result = assessScanDuration(1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('조금 더');
  });

  it('최소 장수를 넘기면 복원은 가능하다고 본다', () => {
    const seconds = Math.ceil(MIN_SCAN_FRAMES / SCAN_EXTRACT_FPS);
    expect(assessScanDuration(seconds).ok).toBe(true);
  });

  it('복원은 되지만 선별 여유가 없는 구간을 구분해 안내한다', () => {
    // 최소는 넘겼지만 목표×1.5 에는 못 미치는 길이.
    const result = assessScanDuration(20);
    expect(result.ok).toBe(true);
    expect(result.hasSelectionSurplus).toBe(false);
    expect(result.message).toContain('더 정확');
  });

  it('충분히 돌면 종료해도 된다고 알린다', () => {
    const result = assessScanDuration(RECOMMENDED_SCAN_SECONDS.max);
    expect(result.hasSelectionSurplus).toBe(true);
    expect(result.message).toContain('충분');
  });

  it('음수·0 초는 0장으로 다룬다', () => {
    expect(expectedFrameCount(-5)).toBe(0);
    expect(assessScanDuration(0).ok).toBe(false);
  });
});

describe('scan3DProgress — 진행률', () => {
  it('단계 가중치 합이 1 이다', () => {
    const sum = Object.values(SCAN_3D_STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('단계가 진행될수록 진행률이 증가한다', () => {
    const order: Scan3DStage[] = [
      'UPLOADING',
      'EXTRACTING',
      'MATCHING',
      'RECONSTRUCTING',
      'SPLATTING',
      'MEASURING',
    ];
    const values = order.map(scan3DProgress);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
    expect(values[0]).toBe(0);
    expect(values.at(-1)!).toBeLessThan(1);
  });

  it('가장 오래 걸리는 단계는 매칭과 3DGS 학습이다', () => {
    expect(SCAN_3D_STAGE_WEIGHTS.MATCHING).toBeGreaterThan(SCAN_3D_STAGE_WEIGHTS.EXTRACTING);
    expect(SCAN_3D_STAGE_WEIGHTS.SPLATTING).toBeGreaterThan(SCAN_3D_STAGE_WEIGHTS.MEASURING);
  });
});
