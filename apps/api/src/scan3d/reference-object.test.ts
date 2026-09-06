import {
  CUSTOM_REFERENCE_MAX_M,
  CUSTOM_REFERENCE_MIN_M,
  MAX_PLAUSIBLE_SCALE,
  REFERENCE_OBJECTS,
  REFERENCE_OBJECT_BY_ID,
  medianScaleFactor,
  scaleFactorFromReference,
  volumeFromRawUnits,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { Scan3DQueue } from './queue.js';

describe('기준 물체 목록', () => {
  it('현장에서 실제로 구할 수 있는 것들이다(인쇄 마커 전제 없음)', () => {
    const ids = REFERENCE_OBJECTS.map((o) => o.id);
    expect(ids).toContain('A4_LONG');
    expect(ids).toContain('BRICK_KS');
    expect(ids).toContain('DOOR_HEIGHT');
  });

  it('모든 항목이 실제 치수와 잴 부위 안내를 갖는다', () => {
    for (const object of REFERENCE_OBJECTS) {
      expect(object.lengthM).toBeGreaterThan(0);
      // 무엇의 길이인지 헷갈리면 배율이 통째로 틀린다 — 안내가 반드시 있어야 한다.
      expect(object.hint.length).toBeGreaterThan(0);
      expect(REFERENCE_OBJECT_BY_ID[object.id]).toBe(object);
    }
  });

  it('치수가 실제 규격과 맞는다', () => {
    expect(REFERENCE_OBJECT_BY_ID.A4_LONG?.lengthM).toBeCloseTo(0.297, 3);
    expect(REFERENCE_OBJECT_BY_ID.BRICK_KS?.lengthM).toBeCloseTo(0.19, 3);
    expect(REFERENCE_OBJECT_BY_ID.CARD?.lengthM).toBeCloseTo(0.0856, 4);
  });
});

describe('scaleFactorFromReference', () => {
  it('실제 길이 ÷ 잰 길이 = 길이 배율', () => {
    // A4 긴 변(0.297m)이 복원 좌표계에서 0.1485단위였다면 배율은 2.
    const result = scaleFactorFromReference({ realLengthM: 0.297, measuredUnits: 0.1485 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.factor).toBeCloseTo(2, 6);
  });

  it('두 점을 안 찍었으면 재라고 안내한다', () => {
    const result = scaleFactorFromReference({ realLengthM: 0.297, measuredUnits: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('두 점');
  });

  it('기준 길이 누락·범위 밖을 막는다(오타 방어)', () => {
    expect(scaleFactorFromReference({ realLengthM: 0, measuredUnits: 1 }).ok).toBe(false);
    expect(
      scaleFactorFromReference({ realLengthM: CUSTOM_REFERENCE_MIN_M / 2, measuredUnits: 1 }).ok,
    ).toBe(false);
    expect(
      scaleFactorFromReference({ realLengthM: CUSTOM_REFERENCE_MAX_M * 2, measuredUnits: 1 }).ok,
    ).toBe(false);
  });

  it('엉뚱한 지점을 잰 경우를 잡는다 — 부피가 세제곱으로 틀리기 때문', () => {
    // 문 높이(2m)라며 점 두 개를 거의 같은 자리에 찍으면 배율이 폭발한다.
    const result = scaleFactorFromReference({
      realLengthM: 2,
      measuredUnits: 1 / (MAX_PLAUSIBLE_SCALE * 2),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('양 끝');
  });
});

describe('medianScaleFactor — 여러 번 잰 값 합치기', () => {
  it('한 번 크게 빗나간 값에 끌려가지 않는다(평균이 아니라 중앙값)', () => {
    const factors = [2.0, 2.1, 1.9, 200];
    const median = medianScaleFactor(factors)!;
    const mean = factors.reduce((a, b) => a + b, 0) / factors.length;
    expect(median).toBeLessThan(3);
    expect(mean).toBeGreaterThan(50);
  });

  it('짝수 개면 가운데 둘의 평균', () => {
    expect(medianScaleFactor([1, 2, 3, 4])).toBe(2.5);
  });

  it('유효값이 없으면 undefined', () => {
    expect(medianScaleFactor([])).toBeUndefined();
    expect(medianScaleFactor([0, -1, NaN])).toBeUndefined();
  });
});

describe('volumeFromRawUnits — 배율의 세제곱', () => {
  it('길이 배율 2 면 부피는 8배', () => {
    expect(volumeFromRawUnits(50, 2)).toBe(400);
  });

  it('0·음수는 0', () => {
    expect(volumeFromRawUnits(0, 2)).toBe(0);
    expect(volumeFromRawUnits(50, 0)).toBe(0);
  });
});

describe('Scan3DQueue.rescale — 복원을 다시 돌리지 않는다', () => {
  function completedJob(rawVolumeUnits?: number) {
    const queue = new Scan3DQueue();
    const job = queue.createJob();
    queue.complete(job.id, {
      grossVolumeM3: 0,
      rawVolumeUnits,
      scaleSource: 'NONE',
      usable: false,
      reasons: ['실제 치수 기준이 없어 부피를 계산할 수 없습니다.'],
      artifacts: {},
      frameCount: 150,
    });
    return { queue, id: job.id };
  }

  it('원시 부피가 있으면 배율만 다시 곱해 부피를 확정한다', () => {
    const { queue, id } = completedJob(50);
    const updated = queue.rescale(id, 2)!;
    expect(updated.result?.grossVolumeM3).toBe(400); // 50 × 2³
    expect(updated.result?.scaleSource).toBe('REFERENCE_OBJECT');
    expect(updated.result?.usable).toBe(true);
  });

  it('치수 기준이 생겼으므로 그 사유만 사라진다', () => {
    const { queue, id } = completedJob(50);
    const updated = queue.rescale(id, 2)!;
    expect(updated.result?.reasons).toEqual([]);
  });

  it('품질 미달 사유는 배율이 생겨도 남는다', () => {
    const queue = new Scan3DQueue();
    const job = queue.createJob();
    queue.complete(job.id, {
      grossVolumeM3: 0,
      rawVolumeUnits: 50,
      scaleSource: 'NONE',
      usable: false,
      reasons: [
        '실제 치수 기준이 없어 부피를 계산할 수 없습니다.',
        '복원된 형상이 너무 성깁니다(무늬 없는 벽면·반사면이 많을 때 생깁니다).',
      ],
      artifacts: {},
      frameCount: 150,
    });
    const updated = queue.rescale(job.id, 2)!;
    expect(updated.result?.reasons).toHaveLength(1);
    expect(updated.result?.reasons[0]).toContain('성깁니다');
  });

  it('원시 부피가 없으면 재계산할 수 없다', () => {
    const { queue, id } = completedJob(undefined);
    expect(queue.rescale(id, 2)).toBeUndefined();
  });

  it('없는 잡은 undefined', () => {
    expect(new Scan3DQueue().rescale('없음', 2)).toBeUndefined();
  });

  it('여러 번 다시 재도 원시 부피 기준으로 계산한다(누적되지 않는다)', () => {
    const { queue, id } = completedJob(50);
    queue.rescale(id, 2);
    const second = queue.rescale(id, 3)!;
    // 400 × 3³ 이 아니라 50 × 3³ 이어야 한다.
    expect(second.result?.grossVolumeM3).toBe(1350);
  });
});
