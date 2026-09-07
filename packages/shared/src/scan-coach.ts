/**
 * 촬영 코치 — 3D 스캔을 찍는 **도중에** 잘못을 잡아준다.
 *
 * 복원 실패의 대부분은 촬영에서 갈린다. 그런데 지금 구조는 다 찍고 업로드해서 서버에서
 * 20~40분 돌린 뒤에야 "정렬률 40%, 다시 찍으세요"라고 말한다. 그때 사용자는 이미 현장을
 * 떠났다. 그래서 **화면에서 실시간으로** 판정한다.
 *
 * 무엇으로 판정하는가는 플랫폼마다 다르다.
 * - 모바일 앱: 기기 센서(회전 속도 + 나침반 방위각). 프레임을 실시간으로 뜯으려면
 *   네이티브 프레임 프로세서가 필요한데, 회전 속도만으로도 실패 원인의 대부분이 잡힌다.
 * - 웹: 카메라 프레임을 캔버스로 직접 본다(변화율 + 선명도). 센서보다 정확하다 —
 *   **초점 흐림은 프레임을 봐야만 알 수 있다.**
 *
 * 어느 쪽이든 판정 규칙은 이 파일 하나를 공유한다. 화면마다 기준이 갈라지면 안 된다.
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

/**
 * 프레임 변화율 상한(0~1). 웹은 카메라 화면을 직접 볼 수 있어 센서 대신 이걸 쓴다.
 *
 * 연속한 두 표본의 화소가 이 비율 이상 달라지면 겹침이 부족하다는 뜻이다. 복원은 인접
 * 사진이 70~80% 겹쳐야 카메라 위치를 푸는데, 변화가 크면 그 조건이 깨진다.
 */
export const MAX_FRAME_CHANGE_RATIO = 0.28;

/** 이보다 변화가 없으면 멈춘 것으로 본다. */
export const MIN_FRAME_CHANGE_RATIO = 0.02;

/**
 * 선명도 하한(라플라시안 분산). [[site-capture-guide]] 의 QUALITY_SHARPNESS_MIN 과 같은 값.
 * 웹에서만 잴 수 있다 — 센서로는 초점을 알 수 없다.
 */
export const COACH_SHARPNESS_MIN = 60;

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

/**
 * 촬영 중 한 번의 측정.
 *
 * 플랫폼마다 잴 수 있는 것이 다르다 — 모바일은 센서(회전 속도), 웹은 카메라 프레임
 * (변화율·선명도). 둘 중 있는 것만 채우면 되고, 판정 규칙은 하나로 공유한다.
 */
export interface CaptureSample {
  /** 기기 회전 속도(도/초). DeviceMotion 의 rotationRate 크기. */
  rotationRateDegPerSec?: number;
  /** 연속 프레임 간 화소 변화율(0~1). 웹에서 캔버스로 잰다. */
  frameChangeRatio?: number;
  /** 선명도(라플라시안 분산). 웹에서만 잴 수 있다 — 센서로는 초점을 모른다. */
  sharpness?: number;
  /** 나침반 방위각(0~359). 없으면 시간 기준으로 진행률을 본다. */
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
  /** 초점이 흐린 상태가 시작된 시각(초). 아니면 null. */
  unsharpSince: number | null;
  /** 방위각을 한 번이라도 받았는지. 없으면 커버리지 대신 시간으로 진행률을 본다. */
  hasAzimuth: boolean;
}

export function createCoachState(): CoachState {
  return {
    covered: new Array<boolean>(COVERAGE_SECTORS).fill(false),
    blurred: new Array<boolean>(COVERAGE_SECTORS).fill(false),
    fastSince: null,
    stillSince: null,
    unsharpSince: null,
    hasAzimuth: false,
    lastElapsed: 0,
  };
}

/**
 * 이 표본이 "너무 빠른가". 센서와 프레임 중 **있는 신호**로 판정한다.
 * 둘 다 있으면 하나라도 넘으면 빠른 것으로 본다(놓치는 쪽보다 안전하다).
 */
export function isTooFast(sample: CaptureSample): boolean {
  const byRotation =
    typeof sample.rotationRateDegPerSec === 'number' &&
    sample.rotationRateDegPerSec > MAX_ROTATION_DEG_PER_SEC;
  const byFrame =
    typeof sample.frameChangeRatio === 'number' &&
    sample.frameChangeRatio > MAX_FRAME_CHANGE_RATIO;
  return byRotation || byFrame;
}

/** 이 표본이 "멈춰 있는가". 신호가 없으면 멈춤으로 단정하지 않는다. */
export function isTooStill(sample: CaptureSample): boolean {
  if (typeof sample.frameChangeRatio === 'number') {
    return sample.frameChangeRatio < MIN_FRAME_CHANGE_RATIO;
  }
  if (typeof sample.rotationRateDegPerSec === 'number') {
    return sample.rotationRateDegPerSec < MIN_ROTATION_DEG_PER_SEC;
  }
  return false;
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
    unsharpSince: state.unsharpSince,
    hasAzimuth: state.hasAzimuth,
    lastElapsed: sample.elapsedSeconds,
  };

  const tooFast = isTooFast(sample);
  const tooStill = isTooStill(sample);
  // 초점은 프레임을 볼 수 있을 때만 판정한다. 빠르게 움직이면 당연히 흐리므로,
  // 속도 경고와 겹치지 않게 "느린데도 흐린" 경우만 잡는다.
  const unsharp =
    typeof sample.sharpness === 'number' && !tooFast && sample.sharpness < COACH_SHARPNESS_MIN;

  next.fastSince = tooFast ? (state.fastSince ?? sample.elapsedSeconds) : null;
  next.stillSince = tooStill ? (state.stillSince ?? sample.elapsedSeconds) : null;
  next.unsharpSince = unsharp ? (state.unsharpSince ?? sample.elapsedSeconds) : null;

  if (typeof sample.azimuth === 'number') {
    next.hasAzimuth = true;
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
 * 우선순위: 너무 빠름 > 초점 흐림 > 다시 찍어야 할 구간 > 멈춤 > 진행 안내.
 * 속도가 제일 위인 이유는, 빠르면 그 구간이 통째로 버려져 나중에 되돌릴 수 없기 때문이다.
 *
 * @param elapsedSeconds 나침반이 없는 기기(대부분의 데스크톱·일부 웹)에서 진행률을
 *   시간으로 대신 보기 위해 받는다. 커버리지가 0으로 굳어 보이는 것을 막는다.
 * @param targetSeconds 권장 촬영 시간.
 */
export function coachAdvice(
  state: CoachState,
  elapsedSeconds = state.lastElapsed,
  targetSeconds = 60,
): CoachAdvice {
  const coverage = state.hasAzimuth
    ? coverageRatio(state)
    : Math.min(1, Math.round((elapsedSeconds / targetSeconds) * 100) / 100);
  const sustained = (since: number | null) =>
    since !== null && state.lastElapsed - since >= WARN_SUSTAIN_SECONDS;

  if (sustained(state.fastSince)) {
    return { level: 'warn', message: '너무 빠릅니다 — 천천히 돌려주세요', coverage };
  }

  if (sustained(state.unsharpSince)) {
    return { level: 'warn', message: '초점이 흐립니다 — 잠시 멈춰 초점을 맞춰주세요', coverage };
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
