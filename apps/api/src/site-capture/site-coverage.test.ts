import {
  MIN_PHOTOS_FOR_FULL_SITE,
  QUALITY_MEAN_MAX,
  QUALITY_SHARPNESS_MIN,
  assessPhotoQuality,
  computeSharpness,
  coverageWarnings,
  photoQualityWarnings,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

describe('coverageWarnings — 결측 선언', () => {
  it('가이드 촬영 정보가 없고 사진이 적으면 범위 한계를 알린다', () => {
    const warnings = coverageWarnings({ photoCount: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2장');
  });

  it('사진이 충분하면 장수 경고를 내지 않는다', () => {
    expect(coverageWarnings({ photoCount: MIN_PHOTOS_FOR_FULL_SITE })).toEqual([]);
  });

  it('빠진 슬롯마다 무엇을 판정하지 못했는지 알린다', () => {
    const warnings = coverageWarnings({
      photoCount: 4,
      slotIds: ['FRONT_WALL', 'RIGHT_WALL', 'BACK_WALL', 'LEFT_WALL'],
    });
    // 바닥·천장이 빠졌다.
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).toContain('바닥');
    expect(warnings.join(' ')).toContain('천장');
  });

  it('천장 결측 경고는 석면 사전조사를 함께 안내한다', () => {
    const warnings = coverageWarnings({ photoCount: 1, slotIds: ['FRONT_WALL'] });
    expect(warnings.find((w) => w.includes('천장재'))).toContain('석면 사전조사');
  });

  it('필수 슬롯을 다 채우면 경고가 없다(선택 슬롯 DAMAGE 는 빠져도 무방)', () => {
    expect(
      coverageWarnings({
        photoCount: 6,
        slotIds: ['FRONT_WALL', 'RIGHT_WALL', 'BACK_WALL', 'LEFT_WALL', 'FLOOR', 'CEILING'],
      }),
    ).toEqual([]);
  });

  it('사진이 0장이면 장수 경고를 내지 않는다(입력 검증이 따로 막는다)', () => {
    expect(coverageWarnings({ photoCount: 0 })).toEqual([]);
  });
});

describe('photoQualityWarnings — 저품질 사진 선언', () => {
  it('품질 사유가 있는 사진만 경고로 만든다', () => {
    const warnings = photoQualityWarnings([
      { slotId: 'FRONT_WALL' },
      { slotId: 'CEILING', qualityWarnings: ['초점이 맞지 않아 흐립니다'] },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('사진 2(천장)');
    expect(warnings[0]).toContain('흐립니다');
    // 그 사진에서 나온 판정은 근거가 약하다는 사실을 명시해야 한다.
    expect(warnings[0]).toContain('신뢰도가 낮습니다');
  });

  it('슬롯을 모르면 사진 번호만 쓴다', () => {
    const warnings = photoQualityWarnings([{ qualityWarnings: ['사진이 너무 어둡습니다'] }]);
    expect(warnings[0]).toContain('사진 1:');
  });

  it('전부 정상이면 경고가 없다', () => {
    expect(photoQualityWarnings([{ slotId: 'FLOOR' }, {}])).toEqual([]);
  });
});

describe('assessPhotoQuality — 통과 여부와 사유', () => {
  const good = { mean: 120, variance: 3000 };

  it('정상 사진은 사유 없이 통과', () => {
    expect(assessPhotoQuality(good, 500)).toEqual({ ok: true, reasons: [] });
  });

  it('선명도 하한 미달은 흐림으로 잡는다 — 대비가 높아도 걸러야 한다', () => {
    // 밝기·대비는 충분한데 초점만 나간 사진. 기존 variance 검사로는 통과했다.
    const result = assessPhotoQuality(good, QUALITY_SHARPNESS_MIN - 1);
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('초점이 맞지 않아 흐립니다');
  });

  it('과노출(역광)을 잡는다', () => {
    const result = assessPhotoQuality({ mean: QUALITY_MEAN_MAX + 1, variance: 3000 }, 500);
    expect(result.reasons.join()).toContain('너무 밝습니다');
  });

  it('암전을 잡는다', () => {
    expect(assessPhotoQuality({ mean: 5, variance: 3000 }, 500).reasons.join()).toContain(
      '너무 어둡습니다',
    );
  });

  it('선명도를 못 재는 플랫폼에서는 선명도 검사를 건너뛴다', () => {
    expect(assessPhotoQuality(good).ok).toBe(true);
  });
});

describe('computeSharpness — 라플라시안 분산', () => {
  /** perAxis×perAxis RGBA 를 만든다. shade(x,y) → 0~255. */
  function image(side: number, shade: (x: number, y: number) => number): number[] {
    const out: number[] = [];
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const v = shade(x, y);
        out.push(v, v, v, 255);
      }
    }
    return out;
  }

  it('선명한 격자무늬가 흐릿한 그라데이션보다 높다', () => {
    const side = 32;
    const sharp = computeSharpness(image(side, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)), side, side);
    const blurry = computeSharpness(image(side, (x) => (x / side) * 255), side, side);
    expect(sharp).toBeGreaterThan(blurry);
    expect(blurry).toBeLessThan(QUALITY_SHARPNESS_MIN);
  });

  it('단색은 0', () => {
    expect(computeSharpness(image(16, () => 128), 16, 16)).toBe(0);
  });

  it('너무 작은 이미지는 0', () => {
    expect(computeSharpness([0, 0, 0, 255], 1, 1)).toBe(0);
  });
});
