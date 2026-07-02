import { DEMOLITION_TON_PER_M2, STRUCTURE_FACTORS } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { EstimationValidationError, HeuristicVolumeEstimator } from './provider.js';

const estimator = new HeuristicVolumeEstimator();

describe('HeuristicVolumeEstimator — 원단위 물량 추정 (AI 연동 전 목)', () => {
  it('연면적 × 원단위 × 구조 보정, 소수 1자리', async () => {
    const result = await estimator.estimate({ floorAreaM2: 100, structure: 'RC' });
    expect(result.estimatedTons).toBe(
      Math.round(100 * DEMOLITION_TON_PER_M2 * STRUCTURE_FACTORS.RC * 10) / 10,
    );
    expect(result.method).toBe('AREA_HEURISTIC');
    expect(result.confidence).toBe('MEDIUM');
    expect(result.disclaimer).toContain('참고 추정치');
  });

  it('구조 미지정이면 보정 없이 신뢰도 LOW', async () => {
    const result = await estimator.estimate({ floorAreaM2: 50 });
    expect(result.estimatedTons).toBe(60);
    expect(result.confidence).toBe('LOW');
  });

  it('목조는 철근콘크리트보다 적게 추정된다', async () => {
    const wood = await estimator.estimate({ floorAreaM2: 100, structure: 'WOOD' });
    const rc = await estimator.estimate({ floorAreaM2: 100, structure: 'RC' });
    expect(wood.estimatedTons).toBeLessThan(rc.estimatedTons);
  });

  it('연면적 누락·0 이하·잘못된 구조 거부', async () => {
    expect(() => estimator.estimate({})).toThrow(EstimationValidationError);
    expect(() => estimator.estimate({ floorAreaM2: 0 })).toThrow(EstimationValidationError);
    expect(() =>
      estimator.estimate({ floorAreaM2: 10, structure: 'STEEL' as never }),
    ).toThrow(EstimationValidationError);
  });
});
