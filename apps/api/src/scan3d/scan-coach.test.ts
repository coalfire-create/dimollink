import {
  COVERAGE_SECTORS,
  MAX_ROTATION_DEG_PER_SEC,
  MIN_ROTATION_DEG_PER_SEC,
  WARN_SUSTAIN_SECONDS,
  coachAdvice,
  coverageRatio,
  createCoachState,
  missingSectorAzimuths,
  sectorOf,
  updateCoach,
  type CaptureSample,
  type CoachState,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';

/**
 * 촬영 코치 — 찍는 도중에 잘못을 잡는다.
 * 다 찍고 20~40분 뒤에 "다시 찍으세요"라고 하면 사용자는 이미 현장을 떠난 뒤다.
 */

/** 일정 속도·방위로 여러 번 측정한 것을 반영한다. */
function feed(
  state: CoachState,
  samples: Array<Partial<CaptureSample> & { elapsedSeconds: number }>,
): CoachState {
  return samples.reduce((s, sample) => {
    // rotationRateDegPerSec 를 명시하지 않은 표본은 "정상 속도"로 본다.
    // 명시적으로 undefined 를 준 표본은 센서가 없는 기기(웹)를 뜻하므로 그대로 둔다.
    const hasRotation = 'rotationRateDegPerSec' in sample;
    return updateCoach(s, {
      rotationRateDegPerSec: hasRotation ? sample.rotationRateDegPerSec : 15,
      frameChangeRatio: sample.frameChangeRatio,
      sharpness: sample.sharpness,
      azimuth: sample.azimuth,
      elapsedSeconds: sample.elapsedSeconds,
    });
  }, state);
}

describe('sectorOf — 방위각 → 구간', () => {
  it('0도부터 30도씩 나눈다', () => {
    expect(sectorOf(0)).toBe(0);
    expect(sectorOf(29)).toBe(0);
    expect(sectorOf(30)).toBe(1);
    expect(sectorOf(359)).toBe(COVERAGE_SECTORS - 1);
  });

  it('음수·360 초과를 정규화한다', () => {
    expect(sectorOf(-30)).toBe(COVERAGE_SECTORS - 1);
    expect(sectorOf(390)).toBe(1);
  });
});

describe('속도 판정', () => {
  it('빨라도 잠깐이면 경고하지 않는다(순간 흔들림에 반응하지 않는다)', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: 90, elapsedSeconds: 1.0 },
      { rotationRateDegPerSec: 90, elapsedSeconds: 1.2 },
    ]);
    expect(coachAdvice(s).message).not.toContain('빠릅니다');
  });

  it('계속 빠르면 경고한다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: 90, elapsedSeconds: 1.0 },
      { rotationRateDegPerSec: 90, elapsedSeconds: 1.0 + WARN_SUSTAIN_SECONDS + 0.1 },
    ]);
    const advice = coachAdvice(s);
    expect(advice.level).toBe('warn');
    expect(advice.message).toContain('너무 빠릅니다');
  });

  it('속도를 늦추면 경고가 사라진다', () => {
    let s = feed(createCoachState(), [
      { rotationRateDegPerSec: 90, elapsedSeconds: 1.0 },
      { rotationRateDegPerSec: 90, elapsedSeconds: 2.0 },
    ]);
    expect(coachAdvice(s).message).toContain('빠릅니다');
    s = feed(s, [{ rotationRateDegPerSec: 15, elapsedSeconds: 2.5, azimuth: 10 }]);
    expect(coachAdvice(s).message).not.toContain('빠릅니다');
  });

  it('멈춰 있으면 걸으라고 한다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: 0, elapsedSeconds: 1.0 },
      { rotationRateDegPerSec: 0, elapsedSeconds: 3.0 },
    ]);
    expect(coachAdvice(s).message).toContain('멈춰');
  });

  it('임계값이 실제로 경계다', () => {
    const slow = feed(createCoachState(), [
      { rotationRateDegPerSec: MAX_ROTATION_DEG_PER_SEC - 1, elapsedSeconds: 1 },
      { rotationRateDegPerSec: MAX_ROTATION_DEG_PER_SEC - 1, elapsedSeconds: 3 },
    ]);
    expect(coachAdvice(slow).message).not.toContain('빠릅니다');
    expect(MIN_ROTATION_DEG_PER_SEC).toBeLessThan(MAX_ROTATION_DEG_PER_SEC);
  });
});

describe('커버리지 — 어디를 안 찍었는지', () => {
  it('한 바퀴 돌면 100%', () => {
    const samples = Array.from({ length: COVERAGE_SECTORS }, (_, i) => ({
      azimuth: i * 30 + 15,
      elapsedSeconds: i * 2,
    }));
    const s = feed(createCoachState(), samples);
    expect(coverageRatio(s)).toBe(1);
    expect(coachAdvice(s).level).toBe('good');
    expect(missingSectorAzimuths(s)).toEqual([]);
  });

  it('반만 돌면 50%이고 빠진 방향을 알려준다', () => {
    const samples = Array.from({ length: COVERAGE_SECTORS / 2 }, (_, i) => ({
      azimuth: i * 30 + 15,
      elapsedSeconds: i * 2,
    }));
    const s = feed(createCoachState(), samples);
    expect(coverageRatio(s)).toBe(0.5);
    expect(missingSectorAzimuths(s)).toHaveLength(COVERAGE_SECTORS / 2);
  });

  it('방위각이 없으면 커버리지를 세지 않는다(나침반 미지원 기기)', () => {
    const s = feed(createCoachState(), [{ elapsedSeconds: 1 }, { elapsedSeconds: 2 }]);
    expect(coverageRatio(s)).toBe(0);
  });
});

describe('너무 빨리 지나친 구간은 다시 찍게 한다', () => {
  it('빠르게 지나간 구간은 커버리지로 세지 않는다', () => {
    // 지나가긴 했지만 모션 블러로 쓸 프레임이 안 나온다.
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: 120, azimuth: 45, elapsedSeconds: 1 },
    ]);
    expect(coverageRatio(s)).toBe(0);
    expect(coachAdvice(s).message).toContain('되돌아가');
  });

  it('그 구간을 천천히 다시 찍으면 해제된다', () => {
    let s = feed(createCoachState(), [
      { rotationRateDegPerSec: 120, azimuth: 45, elapsedSeconds: 1 },
    ]);
    expect(coachAdvice(s).message).toContain('되돌아가');
    s = feed(s, [{ rotationRateDegPerSec: 15, azimuth: 45, elapsedSeconds: 5 }]);
    expect(coachAdvice(s).message).not.toContain('되돌아가');
    expect(coverageRatio(s)).toBeGreaterThan(0);
  });

  it('이미 제대로 찍은 구간을 빠르게 지나가도 다시 찍으라고 하지 않는다', () => {
    let s = feed(createCoachState(), [
      { rotationRateDegPerSec: 15, azimuth: 45, elapsedSeconds: 1 },
    ]);
    s = feed(s, [{ rotationRateDegPerSec: 120, azimuth: 45, elapsedSeconds: 2 }]);
    expect(coachAdvice(s).message).not.toContain('되돌아가');
  });
});

describe('한 번에 한 마디만 — 우선순위', () => {
  it('속도가 커버리지보다 먼저다(빠르면 그 구간이 통째로 버려진다)', () => {
    let s = createCoachState();
    s = feed(s, [{ rotationRateDegPerSec: 15, azimuth: 15, elapsedSeconds: 1 }]);
    s = feed(s, [
      { rotationRateDegPerSec: 120, azimuth: 100, elapsedSeconds: 2 },
      { rotationRateDegPerSec: 120, azimuth: 130, elapsedSeconds: 3 },
    ]);
    expect(coachAdvice(s).message).toContain('너무 빠릅니다');
  });

  it('평상시에는 진행률을 보여준다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: 15, azimuth: 15, elapsedSeconds: 1 },
    ]);
    const advice = coachAdvice(s);
    expect(advice.level).toBe('ok');
    expect(advice.message).toContain('%');
  });
});

describe('프레임 기반 판정 — 웹은 화면을 직접 본다', () => {
  it('프레임 변화가 크면 빠른 것으로 본다(센서 없이도)', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.6, elapsedSeconds: 1 },
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.6, elapsedSeconds: 2 },
    ] as never);
    expect(coachAdvice(s).message).toContain('너무 빠릅니다');
  });

  it('프레임 변화가 거의 없으면 멈춘 것으로 본다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0, elapsedSeconds: 1 },
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0, elapsedSeconds: 3 },
    ] as never);
    expect(coachAdvice(s).message).toContain('멈춰');
  });

  it('초점 흐림은 프레임을 볼 때만 잡는다 — 센서로는 알 수 없다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.1, sharpness: 5, elapsedSeconds: 1 },
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.1, sharpness: 5, elapsedSeconds: 3 },
    ] as never);
    expect(coachAdvice(s).message).toContain('초점이 흐립니다');
  });

  it('빠르게 움직일 때의 흐림은 속도 경고로만 말한다(중복 경고 금지)', () => {
    // 빠르면 당연히 흐리다. 두 경고를 함께 띄우면 무엇을 고쳐야 할지 흐려진다.
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.9, sharpness: 1, elapsedSeconds: 1 },
      { rotationRateDegPerSec: undefined, frameChangeRatio: 0.9, sharpness: 1, elapsedSeconds: 3 },
    ] as never);
    const advice = coachAdvice(s);
    expect(advice.message).toContain('너무 빠릅니다');
    expect(advice.message).not.toContain('초점');
  });

  it('신호가 하나도 없으면 멈춤으로 단정하지 않는다', () => {
    const s = feed(createCoachState(), [
      { rotationRateDegPerSec: undefined, elapsedSeconds: 1 },
      { rotationRateDegPerSec: undefined, elapsedSeconds: 3 },
    ] as never);
    expect(coachAdvice(s).message).not.toContain('멈춰');
  });
});

describe('나침반이 없으면 시간으로 진행률을 본다', () => {
  it('커버리지가 0%로 굳어 보이지 않는다', () => {
    const s = feed(createCoachState(), [{ frameChangeRatio: 0.1, elapsedSeconds: 30 }] as never);
    // 방위각을 못 받았으므로 시간(30/60초)으로 절반 진행을 보여준다.
    expect(coachAdvice(s, 30, 60).coverage).toBe(0.5);
  });

  it('방위각을 받으면 시간이 아니라 커버리지를 쓴다', () => {
    const s = feed(createCoachState(), [
      { azimuth: 15, elapsedSeconds: 60 },
    ] as never);
    // 한 구간만 찍었으므로 시간(100%)이 아니라 커버리지(1/12)여야 한다.
    expect(coachAdvice(s, 60, 60).coverage).toBeLessThan(0.2);
  });
});
