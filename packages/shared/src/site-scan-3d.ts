import type { ScanScaleSource } from './scan-volume.js';

/**
 * 3D 현장 스캔 계약 — 촬영 지침 · 잡 상태 · 결과물.
 *
 * 기존 가이드 촬영([[site-capture-guide]])은 **커버리지**를 위한 설계다(정면/좌우/후/바닥/천장을
 * 90도씩 끊어 7장). 3D 복원은 정반대로 **연속적인 겹침**이 필요하다 — 인접 사진이 70~80%
 * 겹쳐야 카메라 위치를 풀 수 있다. 그래서 별도 촬영 모드로 둔다(기존 플로우는 그대로).
 *
 * 사용자에게 "천천히 한 바퀴"를 시키는 가장 쉬운 방법은 **영상**이라, 영상을 받아 서버에서
 * 프레임을 뽑는 것을 기본 경로로 한다. 연사 촬영도 같은 계약으로 받는다.
 */

/** 스캔 입력 방식. */
export type ScanCaptureMode =
  /** 한 바퀴 영상(권장) — 서버에서 프레임 추출. */
  | 'VIDEO_ORBIT'
  /** 연사 사진 — 네트워크가 느리거나 영상이 안 될 때. */
  | 'PHOTO_BURST';

/** 스캔 대상 범위. 실내는 카메라 간격을 못 벌려 실외보다 어렵다. */
export type ScanTarget = 'EXTERIOR' | 'INTERIOR';

export const SCAN_TARGET_LABELS: Record<ScanTarget, string> = {
  EXTERIOR: '건물 외부 한 바퀴',
  INTERIOR: '실내 공간',
};

/** 복원에 필요한 최소 프레임 수. 이보다 적으면 카메라 위치를 못 푼다. */
export const MIN_SCAN_FRAMES = 40;
/** 프레임이 이보다 많으면 처리 시간만 늘고 품질은 그대로 — 하드 상한. */
export const MAX_SCAN_FRAMES = 200;

/** 복원에 실제로 넣을 프레임 수. COLMAP 매칭 시간이 장수에 비례해 늘어난다. */
export const TARGET_SCAN_FRAMES = 150;

/**
 * 영상에서 초당 뽑을 프레임 수.
 *
 * ⚠️ 목표 장수보다 **넉넉히** 뽑아야 한다. 목표와 같은 수만 뽑으면 구간마다 후보가
 * 1장뿐이라 흐림 선별이 무력해지고, 흔들린 프레임이 그대로 복원에 들어가 실패한다.
 * (3fps 였을 때 30초 촬영 = 90장 → 상한 이하라 전부 통과했다.)
 */
export const SCAN_EXTRACT_FPS = 8;

/**
 * 구간당 후보가 이 배수 미만이면 흐림 선별 효과가 약하다.
 *
 * 실측(3장 중 1장만 선명한 영상 기준, 선별 후 선명 프레임 비율):
 * 여유 1.1배(20초) → 36% · 1.6배(30초) → 53% · **2.4배(45초) → 80%** · 3.2배(60초) → 100%.
 * 무작위 추출이 33% 이므로 1.6배까지는 개선이 미미하다. 무릎점인 2.4배를 기준으로 잡는다.
 */
export const MIN_SELECTION_SURPLUS = 2.4;

/**
 * 권장 촬영 시간(초). 8fps 기준 360~480장이 나와 150장을 골라낼 여유가 생긴다.
 * 하한을 45초로 둔 근거는 위 실측이다 — 30초는 흔들린 프레임을 절반밖에 못 거른다.
 */
export const RECOMMENDED_SCAN_SECONDS = { min: 45, max: 60 } as const;

/** 촬영 시간(초) → 추출 예상 장수. */
export function expectedFrameCount(seconds: number): number {
  return Math.max(0, Math.floor(seconds * SCAN_EXTRACT_FPS));
}

/** 촬영 길이 판정 결과. */
export interface ScanDurationAssessment {
  /** 복원 가능한 최소 장수를 넘겼는지. */
  ok: boolean;
  /** 흐림 선별까지 가능한 여유가 있는지. */
  hasSelectionSurplus: boolean;
  frames: number;
  /** 화면에 그대로 띄우는 안내. */
  message: string;
}

/**
 * 이 길이로 찍으면 복원이 될지 **촬영 중에** 판정한다.
 * 다 찍고 나서 실패를 알리는 것보다, 도는 중에 "조금 더"라고 말하는 편이 훨씬 낫다.
 */
export function assessScanDuration(seconds: number): ScanDurationAssessment {
  const frames = expectedFrameCount(seconds);
  if (frames < MIN_SCAN_FRAMES) {
    return {
      ok: false,
      hasSelectionSurplus: false,
      frames,
      message: `조금 더 촬영해 주세요 (최소 ${Math.ceil(MIN_SCAN_FRAMES / SCAN_EXTRACT_FPS)}초).`,
    };
  }
  const hasSelectionSurplus = frames / TARGET_SCAN_FRAMES >= MIN_SELECTION_SURPLUS;
  if (!hasSelectionSurplus) {
    return {
      ok: true,
      hasSelectionSurplus: false,
      frames,
      message: '복원은 됩니다. 조금 더 돌면 흔들린 장면을 걸러낼 수 있어 더 정확해집니다.',
    };
  }
  return {
    ok: true,
    hasSelectionSurplus: true,
    frames,
    message: '충분합니다. 한 바퀴를 마치면 종료하세요.',
  };
}

/** 촬영 안내 문구 — 화면에서 하드코딩하지 말고 여기서 가져다 쓴다. */
export const SCAN_CAPTURE_COPY = {
  exteriorIntro:
    '건물 주위를 한 바퀴 돌면서 천천히 촬영해 주세요. 45~60초 정도가 가장 좋습니다.',
  interiorIntro:
    '방 가장자리를 따라 천천히 걸으면서 벽을 계속 화면에 담아 주세요.',
  /** 성공률을 좌우하는 실제 요령 — 실패 원인 대부분이 여기서 갈린다. */
  tips: [
    '멈추지 말고 천천히 걸으세요. 빨리 돌리면 흔들려서 복원이 깨집니다.',
    '벽을 화면 가운데 두고, 앞뒤 장면이 계속 겹치게 하세요.',
    '한 바퀴를 끝까지 돌아 출발점으로 돌아오세요.',
    '유리·거울·젖은 바닥은 반사 때문에 잘 안 됩니다. 주변 벽을 더 담으세요.',
    '해가 구름에 가리는 등 밝기가 크게 바뀌면 그 구간이 어긋납니다.',
  ],
  /** 스케일(실제 치수) 확보 안내. */
  scaleHint:
    '크기를 정확히 재려면 A4 용지나 줄자를 바닥에 두고 한 번 비춰 주세요. 건축물대장이 있으면 없어도 됩니다.',
  complete: '촬영이 끝났습니다. 3D 복원은 20~40분 걸리며, 끝나면 알려드립니다.',
} as const;

/** 복원 잡 진행 단계. 사용자에게 진행률을 보여주기 위한 것. */
export type Scan3DStage =
  | 'UPLOADING' //     업로드
  | 'EXTRACTING' //    영상 → 프레임 추출
  | 'MATCHING' //      COLMAP 특징점·매칭 (가장 오래 걸림)
  | 'RECONSTRUCTING' // 카메라 위치·점군 복원
  | 'SPLATTING' //     3D Gaussian Splatting 학습
  | 'MEASURING'; //    부피 계산

export const SCAN_3D_STAGE_LABELS: Record<Scan3DStage, string> = {
  UPLOADING: '사진 올리는 중',
  EXTRACTING: '장면 나누는 중',
  MATCHING: '촬영 위치 계산 중',
  RECONSTRUCTING: '입체 형상 만드는 중',
  SPLATTING: '실사 화질로 다듬는 중',
  MEASURING: '크기·부피 재는 중',
};

/** 단계별 대략 소요 비중(진행률 표시용, 합 1.0). 실측 기반으로 조정한다. */
export const SCAN_3D_STAGE_WEIGHTS: Record<Scan3DStage, number> = {
  UPLOADING: 0.05,
  EXTRACTING: 0.05,
  MATCHING: 0.35,
  RECONSTRUCTING: 0.15,
  SPLATTING: 0.35,
  MEASURING: 0.05,
};

/**
 * 복원 전체 예상 소요(초). L4 기준 실측 근사 — COLMAP 매칭이 대부분을 차지한다.
 * 정확한 값이 아니라 **기다릴 만한지 판단할 근거**를 주는 것이 목적이다.
 */
export const SCAN_3D_TOTAL_SECONDS = 30 * 60;

/**
 * 남은 예상 시간(초). 진행률과 경과 시간으로 보정한다.
 *
 * 20~40분 걸리는 작업에 진행률만 보여주면 사용자는 멈춘 것으로 오해한다.
 * 실제 진행이 예상보다 느리면(경과/진행률이 크면) 남은 시간도 그만큼 늘려 잡아,
 * "10분 남았다"가 30분째 그대로인 상황을 막는다.
 */
export function scan3DRemainingSeconds(progress: number, elapsedSeconds = 0): number {
  const done = Math.min(0.99, Math.max(0, progress));
  if (done <= 0) return SCAN_3D_TOTAL_SECONDS;
  // 실측 속도가 있으면 그걸 쓰고, 없으면 기본 총량으로.
  const projectedTotal =
    elapsedSeconds > 0 ? Math.max(elapsedSeconds / done, SCAN_3D_TOTAL_SECONDS * 0.5) : SCAN_3D_TOTAL_SECONDS;
  return Math.max(0, Math.round(projectedTotal - elapsedSeconds));
}

/** 남은 시간 → 사람이 읽는 문구. 초 단위 정밀도는 무의미하므로 분으로 반올림한다. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 60) return '곧 끝납니다';
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `약 ${Math.round(minutes / 60)}시간 남음` : `약 ${minutes}분 남음`;
}

/** 진행 단계 → 0~1 진행률(앞 단계 가중치 누적). */
export function scan3DProgress(stage: Scan3DStage): number {
  const order: Scan3DStage[] = [
    'UPLOADING',
    'EXTRACTING',
    'MATCHING',
    'RECONSTRUCTING',
    'SPLATTING',
    'MEASURING',
  ];
  let sum = 0;
  for (const s of order) {
    if (s === stage) break;
    sum += SCAN_3D_STAGE_WEIGHTS[s];
  }
  return Math.round(sum * 100) / 100;
}

// ── 업로드 계약 ──────────────────────────────────────────────────────────────

/** 허용 영상 형식. iOS 는 quicktime(mov), Android 는 mp4 를 낸다. */
export const SCAN_VIDEO_ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
] as const;

export type ScanVideoContentType = (typeof SCAN_VIDEO_ALLOWED_CONTENT_TYPES)[number];

export function isAllowedScanVideoContentType(value: string): value is ScanVideoContentType {
  return (SCAN_VIDEO_ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * 영상 1건 최대 크기(200MB).
 * 60초 1080p 가 대략 60~120MB 라 여유를 두되, 무한정 받지는 않는다
 * (업로드 시간이 복원 시간보다 길어지면 사용자가 이탈한다).
 */
export const SCAN_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

/** 스캔 원본 오브젝트 키 prefix. 키에는 PII 를 넣지 않는다 — 무작위 UUID 만. */
export const SCAN_KEY_PREFIX = 'site-scans/';

const SCAN_VIDEO_EXTENSION: Record<ScanVideoContentType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

export function scanVideoExtension(contentType: ScanVideoContentType): string {
  return SCAN_VIDEO_EXTENSION[contentType];
}

/** 스캔 오브젝트 키인지(조회 URL 발급 전 검증). */
export function isValidScanKey(key: string): boolean {
  return /^site-scans\/[0-9a-f-]{36}\/(video\.(mp4|mov)|scene\.ply|mesh\.glb|thumb\.jpg)$/.test(
    key,
  );
}

/** 스캔 1건의 오브젝트 키들 — 잡 id 하나로 묶어 정리·삭제가 쉽게. */
export function scanObjectKeys(scanId: string, videoExt = 'mp4') {
  const base = `${SCAN_KEY_PREFIX}${scanId}/`;
  return {
    video: `${base}video.${videoExt}`,
    scene: `${base}scene.ply`,
    mesh: `${base}mesh.glb`,
    thumbnail: `${base}thumb.jpg`,
  };
}

/** 복원 잡 상태. 본체의 다른 잡 큐(SiteAnalysisQueue)와 같은 어휘를 쓴다. */
export type Scan3DJobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

/** 복원 결과 — 부피와 산출물, 그리고 왜 못 쓰는지. */
export interface Scan3DResult {
  grossVolumeM3: number;
  /**
   * 복원 좌표계 원시 부피(단위³). **배율이 바뀌어도 복원을 다시 돌리지 않기 위해** 남긴다 —
   * 부피는 배율의 세제곱이므로 이 값만 있으면 재계산이 공짜다([[reference-object]]).
   */
  rawVolumeUnits?: number;
  scaleSource: ScanScaleSource;
  /** 물량 산정에 쓸 수 있는지. false 면 본체가 연면적 원단위로 폴백한다. */
  usable: boolean;
  reasons: string[];
  artifacts: Scan3DArtifacts;
  frameCount: number;
}

/** 잡 1건. */
export interface Scan3DJob {
  id: string;
  status: Scan3DJobStatus;
  stage?: Scan3DStage;
  /** 0~1. 화면 진행률 표시용. */
  progress: number;
  result?: Scan3DResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** 스캔 요청(앱 → 서버). 원본은 스토리지에 직접 올리고 key 만 넘긴다. */
export interface Scan3DRequest {
  mode: ScanCaptureMode;
  target: ScanTarget;
  /** 업로드된 영상 key(VIDEO_ORBIT) 또는 사진 key 배열(PHOTO_BURST). */
  videoKey?: string;
  photoKeys?: string[];
  /** 현장 주소 — 건축물대장 연면적으로 스케일을 역산할 때 쓴다. */
  siteAddress?: string;
  /** 촬영 중 기록한 기기 포즈(있으면 미터 단위 스케일이 공짜로 나온다). */
  hasArPose?: boolean;
}

/** 복원 결과물 — 저장소 key 로만 주고받는다(파일이 크다). */
export interface Scan3DArtifacts {
  /** 3D Gaussian Splatting 장면(.ply/.splat). 실사 화질 뷰어가 읽는다. */
  splatKey?: string;
  /** 메시(.glb). 부피 계산·경량 뷰어용. */
  meshKey?: string;
  /** 미리보기 썸네일. */
  thumbnailKey?: string;
}
