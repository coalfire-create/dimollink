import { describe, expect, it } from 'vitest';
import {
  AZIMUTH_TOLERANCE,
  SITE_CAPTURE_SLOTS,
  SITE_CAPTURE_TOTAL,
  SITE_CAPTURE_COPY,
  QUALITY_MEAN_MIN,
  QUALITY_VARIANCE_MIN,
  azimuthDelta,
  isWithinTarget,
  relativeAzimuth,
  isPitchWithin,
  isSlotAligned,
  computeLumaStats,
  isPhotoQualityOk,
  subsampleRgba,
  createSiteCaptureSession,
  reduceSiteCapture,
  completedCount,
  currentSlot,
  photosForSlot,
  type SiteCaptureSlot,
} from '@dimol/shared';

const bySlot = (id: string): SiteCaptureSlot => SITE_CAPTURE_SLOTS.find((s) => s.id === id)!;

describe('슬롯 정의', () => {
  it('7개 슬롯이 순서대로 정의된다', () => {
    expect(SITE_CAPTURE_TOTAL).toBe(7);
    expect(SITE_CAPTURE_SLOTS.map((s) => s.id)).toEqual([
      'FRONT_WALL',
      'RIGHT_WALL',
      'BACK_WALL',
      'LEFT_WALL',
      'FLOOR',
      'CEILING',
      'DAMAGE',
    ]);
    SITE_CAPTURE_SLOTS.forEach((s, i) => expect(s.order).toBe(i + 1));
  });

  it('벽 슬롯은 0/90/180/270 상대 방위각을 가진다', () => {
    expect(bySlot('FRONT_WALL').relativeAzimuth).toBe(0);
    expect(bySlot('RIGHT_WALL').relativeAzimuth).toBe(90);
    expect(bySlot('BACK_WALL').relativeAzimuth).toBe(180);
    expect(bySlot('LEFT_WALL').relativeAzimuth).toBe(270);
  });

  it('바닥/천장은 pitch 범위, 손상부위는 선택·다중', () => {
    expect(bySlot('FLOOR').pitchRange).toEqual([-90, -70]);
    expect(bySlot('CEILING').pitchRange).toEqual([70, 90]);
    const damage = bySlot('DAMAGE');
    expect(damage.optional).toBe(true);
    expect(damage.allowMultiple).toBe(true);
    // 손상부위 외 슬롯은 필수 · 단일
    SITE_CAPTURE_SLOTS.filter((s) => s.id !== 'DAMAGE').forEach((s) => {
      expect(s.optional).toBe(false);
      expect(s.allowMultiple).toBe(false);
    });
  });
});

describe('방위각 판정', () => {
  it('azimuthDelta 는 0/360 경계를 원형으로 처리한다', () => {
    expect(azimuthDelta(0, 0)).toBe(0);
    expect(azimuthDelta(10, 350)).toBe(20);
    expect(azimuthDelta(350, 10)).toBe(20);
    expect(azimuthDelta(0, 180)).toBe(180);
    expect(azimuthDelta(90, 270)).toBe(180);
  });

  it('isWithinTarget 은 ±20도 안에서만 참, 경계를 넘어가며 판정', () => {
    expect(isWithinTarget(0, 0)).toBe(true);
    expect(isWithinTarget(20, 0)).toBe(true);
    expect(isWithinTarget(21, 0)).toBe(false);
    // 359도와 목표 0도는 1도 차이 → 참 (절대 방위각 그대로 빼면 안 됨)
    expect(isWithinTarget(359, 0)).toBe(true);
    expect(isWithinTarget(340, 0)).toBe(true); // 정확히 20도 → 경계 포함
    expect(isWithinTarget(339, 0)).toBe(false); // 21도 → 벗어남
    // 커스텀 tolerance
    expect(isWithinTarget(30, 0, 30)).toBe(true);
  });

  it('relativeAzimuth 는 기준 대비 0~359 상대각', () => {
    expect(relativeAzimuth(90, 0)).toBe(90);
    expect(relativeAzimuth(10, 100)).toBe(270); // 100 기준에서 10도는 -90 = 270
    expect(relativeAzimuth(370, 10)).toBe(0);
  });

  it('isPitchWithin 은 범위 경계를 포함한다', () => {
    expect(isPitchWithin(-80, [-90, -70])).toBe(true);
    expect(isPitchWithin(-90, [-90, -70])).toBe(true);
    expect(isPitchWithin(-69, [-90, -70])).toBe(false);
    expect(isPitchWithin(80, [70, 90])).toBe(true);
  });
});

describe('isSlotAligned — 슬롯별 방향 게이트', () => {
  it('벽 슬롯: 기준(base) 미설정이면 판정 불가(false)', () => {
    expect(isSlotAligned(bySlot('FRONT_WALL'), null, { azimuth: 0, pitch: 0 })).toBe(false);
  });

  it('벽 슬롯: 기준 대비 상대각으로 판정한다', () => {
    // 기준 base=100 이면 우측벽 목표 = 100+90 = 190
    expect(isSlotAligned(bySlot('RIGHT_WALL'), 100, { azimuth: 190, pitch: 0 })).toBe(true);
    expect(isSlotAligned(bySlot('RIGHT_WALL'), 100, { azimuth: 205, pitch: 0 })).toBe(true); // 15도 오차
    expect(isSlotAligned(bySlot('RIGHT_WALL'), 100, { azimuth: 130, pitch: 0 })).toBe(false); // 60도 어긋남
    // 기준이 350 이면 후면벽 목표 = (350+180)%360 = 170
    expect(isSlotAligned(bySlot('BACK_WALL'), 350, { azimuth: 170, pitch: 0 })).toBe(true);
  });

  it('바닥/천장: pitch 로만 판정(방위 무관)', () => {
    expect(isSlotAligned(bySlot('FLOOR'), 0, { azimuth: 123, pitch: -85 })).toBe(true);
    expect(isSlotAligned(bySlot('FLOOR'), 0, { azimuth: 123, pitch: 0 })).toBe(false);
    expect(isSlotAligned(bySlot('CEILING'), 0, { azimuth: 200, pitch: 80 })).toBe(true);
  });

  it('손상부위: 방향 제한 없이 항상 true', () => {
    expect(isSlotAligned(bySlot('DAMAGE'), null, { azimuth: 42, pitch: 42 })).toBe(true);
  });
});

describe('품질 검증 (밝기·분산)', () => {
  // 4픽셀(RGBA) 헬퍼
  const rgba = (grays: number[]): number[] => grays.flatMap((g) => [g, g, g, 255]);

  it('computeLumaStats 는 평균/분산을 계산한다', () => {
    const { mean, variance } = computeLumaStats(rgba([0, 100, 100, 200]));
    expect(mean).toBe(100);
    // 분산 = 평균제곱 - 평균^2
    const meanSq = (0 + 10000 + 10000 + 40000) / 4; // 15000
    expect(variance).toBeCloseTo(meanSq - 100 * 100, 5); // 5000
  });

  it('빈 배열은 0/0', () => {
    expect(computeLumaStats([])).toEqual({ mean: 0, variance: 0 });
  });

  it('암전(거의 검정)은 품질 미달', () => {
    const dark = computeLumaStats(rgba([5, 6, 4, 5, 6, 5]));
    expect(dark.mean).toBeLessThan(QUALITY_MEAN_MIN);
    expect(isPhotoQualityOk(dark)).toBe(false);
  });

  it('단색(렌즈 가림 / 흐림)은 분산 미달로 미달', () => {
    const flat = computeLumaStats(rgba([128, 128, 128, 128, 128]));
    expect(flat.mean).toBeGreaterThan(QUALITY_MEAN_MIN);
    expect(flat.variance).toBeLessThan(QUALITY_VARIANCE_MIN);
    expect(isPhotoQualityOk(flat)).toBe(false);
  });

  it('밝고 명암이 있는 사진은 통과', () => {
    const good = computeLumaStats(rgba([30, 200, 60, 180, 90, 220]));
    expect(isPhotoQualityOk(good)).toBe(true);
  });
});

describe('subsampleRgba — 큰 이미지 다운샘플', () => {
  // width*height*4 길이의 RGBA. gray 값 = 픽셀 인덱스로 채운다.
  const makeImage = (w: number, h: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < w * h; i += 1) out.push(i % 256, i % 256, i % 256, 255);
    return out;
  };

  it('작은 이미지는 모든 픽셀을 그대로 담는다(step=1)', () => {
    const img = makeImage(4, 4);
    const sampled = subsampleRgba(img, 4, 4, 64);
    expect(sampled.length).toBe(4 * 4 * 4);
  });

  it('큰 이미지는 축당 표본 수 안팎으로 크게 압축된다', () => {
    const sampled = subsampleRgba(makeImage(640, 480), 640, 480, 64);
    const pixelCount = sampled.length / 4;
    // 원본(307,200px)보다 훨씬 작고, floor 스텝 특성상 축당 최대 ~2·perAxis 이하.
    expect(pixelCount).toBeLessThanOrEqual(2 * 64 * (2 * 64));
    expect(pixelCount).toBeLessThan(640 * 480);
    expect(pixelCount).toBeGreaterThan(0);
    // 알파는 항상 255
    for (let i = 3; i < sampled.length; i += 4) expect(sampled[i]).toBe(255);
  });

  it('빈 이미지는 빈 배열', () => {
    expect(subsampleRgba([], 0, 0)).toEqual([]);
  });

  it('다운샘플 후에도 균일 단색은 분산 0(품질 미달 판정에 일관)', () => {
    const flat: number[] = [];
    for (let i = 0; i < 200 * 200; i += 1) flat.push(128, 128, 128, 255);
    const stats = computeLumaStats(subsampleRgba(flat, 200, 200, 64));
    expect(stats.mean).toBeCloseTo(128, 5);
    expect(stats.variance).toBeCloseTo(0, 5);
    expect(isPhotoQualityOk(stats)).toBe(false);
  });
});

describe('촬영 세션 상태머신', () => {
  const photo = (n: number) => ({ base64: `b${n}`, mimeType: 'image/jpeg', uri: `u${n}` });

  it('첫 슬롯 촬영 시 atAzimuth 로 기준각을 고정한다', () => {
    let s = createSiteCaptureSession();
    expect(s.baseAzimuth).toBeNull();
    s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(1), atAzimuth: 137 });
    expect(s.baseAzimuth).toBe(137);
    expect(s.currentIndex).toBe(1);
    expect(completedCount(s)).toBe(1);
    expect(currentSlot(s)?.id).toBe('RIGHT_WALL');
  });

  it('단일 슬롯은 촬영하면 다음으로 넘어간다', () => {
    let s = createSiteCaptureSession();
    for (let i = 0; i < 4; i += 1) {
      s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(i), atAzimuth: 0 });
    }
    expect(currentSlot(s)?.id).toBe('FLOOR');
    expect(s.photos).toHaveLength(4);
  });

  it('필수 슬롯은 건너뛸 수 없다', () => {
    const s = createSiteCaptureSession();
    const after = reduceSiteCapture(s, { type: 'SKIP' });
    expect(after).toBe(s); // 변화 없음
  });

  it('손상부위(다중)는 여러 장 쌓이고 FINISH_MULTIPLE 로 종료·완료된다', () => {
    let s = createSiteCaptureSession();
    // 앞 6개 슬롯 통과
    for (let i = 0; i < 6; i += 1) {
      s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(i), atAzimuth: 0 });
    }
    expect(currentSlot(s)?.id).toBe('DAMAGE');
    // 손상부위 2장
    s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(10) });
    s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(11) });
    expect(s.done).toBe(false);
    expect(photosForSlot(s, 'DAMAGE')).toHaveLength(2);
    s = reduceSiteCapture(s, { type: 'FINISH_MULTIPLE' });
    expect(s.done).toBe(true);
    expect(completedCount(s)).toBe(7);
  });

  it('손상부위는 촬영 없이 건너뛰어도 완료된다', () => {
    let s = createSiteCaptureSession();
    for (let i = 0; i < 6; i += 1) {
      s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(i), atAzimuth: 0 });
    }
    s = reduceSiteCapture(s, { type: 'SKIP' });
    expect(s.done).toBe(true);
    expect(completedCount(s)).toBe(7);
    expect(photosForSlot(s, 'DAMAGE')).toHaveLength(0);
  });

  it('완료 후에는 추가 액션이 무시된다', () => {
    let s = createSiteCaptureSession();
    for (let i = 0; i < 6; i += 1) {
      s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(i), atAzimuth: 0 });
    }
    s = reduceSiteCapture(s, { type: 'SKIP' });
    const done = s;
    expect(reduceSiteCapture(done, { type: 'CAPTURE', photo: photo(99) })).toBe(done);
  });

  it('RESET 은 세션을 초기화한다', () => {
    let s = createSiteCaptureSession();
    s = reduceSiteCapture(s, { type: 'CAPTURE', photo: photo(1), atAzimuth: 50 });
    s = reduceSiteCapture(s, { type: 'RESET' });
    expect(s).toEqual(createSiteCaptureSession());
  });
});

describe('UI 문구', () => {
  it('진행률 문구는 완료 수/총 슬롯 수를 표기', () => {
    expect(SITE_CAPTURE_COPY.progress(0)).toBe(
      '철거 현장 전체를 빠짐없이 기록해주세요 (진행률: 0/7)',
    );
    expect(SITE_CAPTURE_COPY.progress(7)).toContain('7/7');
  });

  it('허용 오차 상수는 20도', () => {
    expect(AZIMUTH_TOLERANCE).toBe(20);
  });
});
