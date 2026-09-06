/**
 * 촬영 코치 — 3D 스캔을 찍는 **도중에** 잘못을 잡아준다.
 *
 * 복원 실패의 대부분은 촬영에서 갈린다. 그런데 지금 구조는 다 찍고 업로드해서 서버에서
 * 20~40분 돌린 뒤에야 "정렬률 40%, 다시 찍으세요"라고 말한다. 그때 사용자는 이미 현장을
 * 떠났다. 그래서 **화면에서 실시간으로** 판정한다.
 *
 * 무엇으로 판정하는가: 기기 센서다(회전 속도 + 나침반 방위각). 카메라 프레임을 실시간으로
 * 뜯으려면 네이티브 프레임 프로세서가 필요한데, 회전 속도만으로도 실패 원인의 대부분
 * (너무 빠름 → 모션 블러 + 겹침 부족)이 잡힌다. 방위각을 누적하면 **어느 방향을 안 찍었는지**도
 * 알 수 있다.
 *
 * 설계 원칙: **한 번에 한 마디만.** 경고를 여러 개 띄우면 걸으면서 읽지 못한다.
 * 가장 중요한 것 하나만 고른다.
 */

/** 한 바퀴를 몇 구간으로 나눠 커버리지를 볼지. 30도씩 12구간. */
export const COVERAGE_SECTORS = 12;

/**
 * 이보다 빨리 돌리면 "너무 빠르다"로 본다(도/초).
 *
 * 근거: 손각대 노출이 대략 1/60초라, 40도/초면 한 프레임에 0.7도가 번진다. 그 이상은
 * 모션 블러가 눈에 띄게 생겨 특징점 매칭이 깨진다. 겹침(overlap)도 같이 줄어든다.
 */
export const MAX_ROTATION_DEG_PER_SEC = 40;

/** 이보다 느리면 사실상 멈춘 것 — 시간만 쓰고 커버리지가 안 는다. */
export const MIN_ROTATION_DEG_PER_SEC = 3;

/** 경고를 띄우기 전에 이 시간(초) 이상 지속돼야 한다. 순간적인 흔들림에 반응하지 않게. */
export const WARN_SUSTAIN_SECONDS = 0.6;

/** 코치 판정 등급. */
export type CoachLevel = 'ok' | 'warn' | 'good';

export interface CoachAdvice {
  level: CoachLevel;
  /** 화면에 그대로 띄우는 한 마디. */
  message: string;
  /** 0~1. 한 바퀴 커버리지 진행률. */
  coverage: number;
}

/** 촬영 중 한 번의 측정. */
export interface CaptureSample {
  /** 기기 회전 속도(도/초). DeviceMotion 의 rotationRate 크기. */
  rotationRateDegPerSec: number;
  /** 나침반 방위각(0~359). 없으면 커버리지를 세지 않는다. */
  azimuth?: number;
  /** 촬영 시작부터의 경과(초). */
  elapsedSeconds: number;
}

export interface CoachState {
  /** 각 구간을 찍었는지. 인덱스 = 방위각 / 30도. */
  covered: boolean[];
  /** 너무 빠른 상태가 시작된 시각(초). 아니면 null. */
  fastSince: number | null;
  /** 멈춘 상태가 시작된 시각(초). 아니면 null. */
  stillSince: number | null;
  /** 마지막 측정 시각. */
  lastElapsed: number;
  /** 너무 빨라서 놓친 구간 — 다시 찍어야 한다. */
  blurred: boolean[];
}

export function createCoachState(): CoachState {
  return {
    covered: new Array<boolean>(COVERAGE_SECTORS).fill(false),
    blurred: new Array<boolean>(COVERAGE_SECTORS).fill(false),
    fastSince: null,
    stillSince: null,
    lastElapsed: 0,
  };
}

/** 방위각 → 구간 인덱스. */
export function sectorOf(azimuth: number): number {
  const normalized = ((azimuth % 360) + 360) % 360;
  return Math.floor(normalized / (360 / COVERAGE_SECTORS)) % COVERAGE_SECTORS;
}

/**
 * 측정 하나를 반영한다(순수 함수 — 새 상태를 돌려준다).
 *
 * 너무 빠르게 지나간 구간은 **커버리지로 세지 않고 blurred 로 표시한다.**
 * 지나가긴 했지만 쓸 수 있는 프레임이 안 나왔다는 뜻이라, 다시 찍어야 한다.
 */
export function updateCoach(state: CoachState, sample: CaptureSample): CoachState {
  const next: CoachState = {
    covered: [...state.covered],
    blurred: [...state.blurred],
    fastSince: state.fastSince,
    stillSince: state.stillSince,
    lastElapsed: sample.elapsedSeconds,
  };

  const tooFast = sample.rotationRateDegPerSec > MAX_ROTATION_DEG_PER_SEC;
  const tooStill = sample.rotationRateDegPerSec < MIN_ROTATION_DEG_PER_SEC;

  next.fastSince = tooFast ? (state.fastSince ?? sample.elapsedSeconds) : null;
  next.stillSince = tooStill ? (state.stillSince ?? sample.elapsedSeconds) : null;

  if (typeof sample.azimuth === 'number') {
    const sector = sectorOf(sample.azimuth);
    if (tooFast) {
      // 지나가긴 했지만 쓸 만한 프레임이 안 나온 구간.
      if (!next.covered[sector]) next.blurred[sector] = true;
    } else {
      next.covered[sector] = true;
      next.blurred[sector] = false; // 다시 제대로 찍었으면 해제.
    }
  }

  return next;
}

/** 찍은 구간 비율(0~1). */
export function coverageRatio(state: CoachState): number {
  const done = state.covered.filter(Boolean).length;
  return Math.round((done / COVERAGE_SECTORS) * 100) / 100;
}

/**
 * 지금 화면에 띄울 **한 마디**를 고른다.
 *
 * 우선순위: 너무 빠름 > 다시 찍어야 할 구간 > 멈춤 > 진행 안내.
 * 속도가 제일 위인 이유는, 빠르면 그 구간이 통째로 버려져 나중에 되돌릴 수 없기 때문이다.
 */
export function coachAdvice(state: CoachState): CoachAdvice {
  const coverage = coverageRatio(state);
  const sustained = (since: number | null) =>
    since !== null && state.lastElapsed - since >= WARN_SUSTAIN_SECONDS;

  if (sustained(state.fastSince)) {
    return { level: 'warn', message: '너무 빠릅니다 — 천천히 돌려주세요', coverage };
  }

  const blurredCount = state.blurred.filter(Boolean).length;
  if (blurredCount > 0) {
    return {
      level: 'warn',
      message: `지나친 구간이 ${blurredCount}곳 있습니다 — 그쪽으로 되돌아가 다시 찍어주세요`,
      coverage,
    };
  }

  if (sustained(state.stillSince)) {
    return { level: 'warn', message: '멈춰 있습니다 — 계속 걸으면서 찍어주세요', coverage };
  }

  if (coverage >= 1) {
    return { level: 'good', message: '한 바퀴 완료 — 출발점에서 2~3초 더 찍고 끝내세요', coverage };
  }

  return {
    level: 'ok',
    message: `좋습니다 — 계속 도세요 (${Math.round(coverage * 100)}%)`,
    coverage,
  };
}

/**
 * 아직 안 찍은 구간의 방위각 목록(도). 화면에 방향 표시를 그릴 때 쓴다.
 * 커버리지 링에서 빈 칸을 칠하는 용도라, 구간 중앙 각도를 돌려준다.
 */
export function missingSectorAzimuths(state: CoachState): number[] {
  const width = 360 / COVERAGE_SECTORS;
  return state.covered
    .map((done, i) => (done ? null : i * width + width / 2))
    .filter((a): a is number => a !== null);
}
