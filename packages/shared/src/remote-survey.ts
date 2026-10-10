import { SITE_CAPTURE_SLOTS, type SiteCaptureSlotId } from './site-capture-guide.js';
import { isValidSitePhotoKey } from './site-photo.js';

/**
 * 원격 실사 촬영 패키지 — 업체가 현장에 가지 않고도 **현장에서 보던 것을 그대로 보게** 한다.
 *
 * 철거 견적은 개산 → 실사 → 확정 3단계다([[demolition-estimate]]). 실사의 목적은 사진에
 * 안 나오는 것(지붕 재질, 벽 두께, 지하, 진입로 폭, 이웃 건물 간격)을 확인하는 것이다.
 * 그래서 "아무 사진이나 많이"가 아니라 **업체가 현장에서 실제로 확인하는 항목**을
 * 체크리스트로 정해 두고, 항목마다 무엇을 어떻게 찍을지 안내한다.
 *
 * 그래도 빠진 게 있으면 업체가 "이것 더 찍어 주세요"([[RemoteSurveyShotRequest]])를
 * 보내고 소비자가 찍어서 보낸다 — 현장에서 "저기 좀 보여주세요" 하던 것을 대신한다.
 *
 * 사진은 기존 현장 사진 업로드 흐름([[site-photo]] presign → 오브젝트 key)을 그대로 쓴다.
 * 이 모듈은 key 만 다룬다.
 */

// ────────────────────────────────────────────────────────────────────────────
// 정책 상수
// ────────────────────────────────────────────────────────────────────────────

/**
 * 방 최대 개수. 단독주택·상가주택 기준 12칸이면 계단실·다용도실까지 충분하다.
 * 상한이 없으면 같은 방을 이름만 바꿔 계속 추가하는 실수가 쌓인다.
 */
export const REMOTE_SURVEY_MAX_ROOMS = 12;

/** 방 이름 최대 길이 — "거실", "2층 안방" 정도면 된다. 길면 목록이 깨진다. */
export const REMOTE_SURVEY_ROOM_NAME_MAX = 20;

/**
 * 항목(또는 방의 슬롯) 하나에 붙일 수 있는 사진 수 상한.
 * 업체가 볼 장수가 끝없이 늘면 오히려 핵심을 놓친다. 현장 사진 1건 상한과 같은 10장.
 */
export const REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM = 10;

/** 메모·추가 촬영 요청 문구 최대 길이. 고령 사용자 화면에서 한눈에 읽히는 길이. */
export const REMOTE_SURVEY_TEXT_MAX = 300;

/** 지상 층수 입력 상한 — 철거 대상(건설폐기물·소규모 건축물) 범위 밖 값은 오타로 본다. */
export const REMOTE_SURVEY_MAX_FLOORS = 30;

/**
 * 업체 한 곳이 한 패키지에 동시에 열어 둘 수 있는 추가 촬영 요청 수.
 * 소비자(고령자 다수)가 한 번에 감당할 수 있는 양을 넘기면 아무것도 안 찍고 포기한다.
 * 받은 것을 처리해야 다음 요청을 보낼 수 있게 한다.
 */
export const REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER = 3;

// ────────────────────────────────────────────────────────────────────────────
// 체크리스트(업체가 현장에서 확인하는 것)
// ────────────────────────────────────────────────────────────────────────────

export type RemoteSurveyItemId =
  | 'EXTERIOR'
  | 'ROOMS'
  | 'ROOF'
  | 'CEILING_MATERIAL'
  | 'FLOOR_MATERIAL'
  | 'WALL_SECTION'
  | 'BASEMENT_ENTRANCE'
  | 'UTILITIES'
  | 'ACCESS_ROAD'
  | 'OVERHEAD_WIRES'
  | 'NEIGHBOR_GAP';

/**
 * 항목을 어떤 촬영 화면으로 채우는가.
 *  - `SCAN_OR_PHOTOS`: 3D 스캔(건물 한 바퀴 영상) 또는 사진 여러 장 — 외부 전경.
 *  - `ROOMS`: 방마다 가이드 촬영(벽 4면·바닥·천장, [[site-capture-guide]]).
 *  - `PHOTOS`: 자유 촬영으로 클로즈업 몇 장.
 */
export type RemoteSurveyCaptureKind = 'SCAN_OR_PHOTOS' | 'ROOMS' | 'PHOTOS';

/**
 * 필수 여부.
 *  - `REQUIRED`: 없으면 제출할 수 없다.
 *  - `OPTIONAL`: 있으면 좋다(해당 없는 현장이 많다).
 *  - `IF_BASEMENT`: 질문지에서 지하가 "있다"고 답했을 때만 필수.
 */
export type RemoteSurveyRequirement = 'REQUIRED' | 'OPTIONAL' | 'IF_BASEMENT';

export interface RemoteSurveyItem {
  id: RemoteSurveyItemId;
  /** 짧은 제목(목록 표시). */
  title: string;
  /** 무엇을 어떻게 찍는지 — 소비자에게 그대로 보인다. 짧고 쉬운 말로. */
  instruction: string;
  capture: RemoteSurveyCaptureKind;
  requirement: RemoteSurveyRequirement;
  /** 완료로 보는 최소 사진 수. `ROOMS` 는 방 단위로 따로 판정하므로 1(방 1개). */
  minPhotos: number;
  /** 업체가 이 항목으로 무엇을 판단하는가 — 업체 화면에 보이고, 항목을 지우지 않는 이유다. */
  why: string;
}

/** 순서 = 화면에 보이는 순서 = 업체가 현장에서 보는 순서(밖 → 안 → 세부 → 주변). */
export const REMOTE_SURVEY_ITEMS: readonly RemoteSurveyItem[] = [
  {
    id: 'EXTERIOR',
    title: '건물 바깥 전체',
    instruction:
      '건물 둘레를 한 바퀴 돌며 영상을 찍거나, 앞·뒤·왼쪽·오른쪽 4면을 사진으로 찍어 주세요.',
    capture: 'SCAN_OR_PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 4,
    why: '규모·구조(철근콘크리트/조적/목조)와 부피를 판단한다. 3D 스캔이면 물량을 직접 잰다.',
  },
  {
    id: 'ROOMS',
    title: '방마다 안쪽',
    instruction: '방 이름을 넣고(거실, 안방, 주방 등) 안내대로 벽 4면·바닥·천장을 찍어 주세요.',
    capture: 'ROOMS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '내장재 양(폐기물 성상별 물량)과 칸막이 벽 수를 판단한다.',
  },
  {
    id: 'ROOF',
    title: '지붕',
    instruction:
      '지붕 재질이 보이게 가까이 찍어 주세요. 올라가지 말고 땅이나 창문에서 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '슬레이트면 석면 의심 — 해체 신고·전문업체·처리비가 완전히 달라진다.',
  },
  {
    id: 'CEILING_MATERIAL',
    title: '천장 마감재',
    instruction: '천장 판을 가까이 찍어 주세요. 떨어진 곳이 있으면 그 안쪽도 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '석면 텍스(천장재) 여부와 반자틀(목재/경량철골)을 판단한다.',
  },
  {
    id: 'FLOOR_MATERIAL',
    title: '바닥 마감재',
    instruction: '바닥재를 가까이 찍어 주세요. 장판이면 한쪽 끝을 들춰서 아래도 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '바닥 난방 배관·몰탈 두께·석면 바닥타일 여부를 판단한다.',
  },
  {
    id: 'WALL_SECTION',
    title: '벽 두께',
    instruction: '창문틀이나 문틀 옆에서 벽 두께가 보이게 찍어 주세요. 줄자를 대면 더 좋아요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '벽 두께로 구조(블록/벽돌/콘크리트)와 콘크리트 물량을 추정한다.',
  },
  {
    id: 'BASEMENT_ENTRANCE',
    title: '지하 입구',
    instruction: '지하로 내려가는 입구와 계단을 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'IF_BASEMENT',
    minPhotos: 1,
    why: '지하층은 되메우기·흙막이가 필요할 수 있어 금액 차이가 가장 크다.',
  },
  {
    id: 'UTILITIES',
    title: '계량기·정화조',
    instruction: '전기·수도·가스 계량기와 정화조 뚜껑이 있으면 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'OPTIONAL',
    minPhotos: 1,
    why: '인입선 철거 신청과 정화조 청소·폐쇄 비용을 판단한다.',
  },
  {
    id: 'ACCESS_ROAD',
    title: '들어오는 길',
    instruction: '큰길에서 집까지 들어오는 길을 찍어 주세요. 가장 좁은 곳도 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 2,
    why: '굴착기·덤프트럭이 들어올 수 있는지 — 못 들어오면 소형 장비·인력으로 바뀌어 비싸진다.',
  },
  {
    id: 'OVERHEAD_WIRES',
    title: '전깃줄',
    instruction: '건물 위나 앞을 지나는 전깃줄·통신선이 있으면 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'OPTIONAL',
    minPhotos: 1,
    why: '장비 작업 반경과 한전 이설·보호 요청 필요 여부를 판단한다.',
  },
  {
    id: 'NEIGHBOR_GAP',
    title: '옆 건물과의 간격',
    instruction:
      '옆 건물이나 담장과 붙어 있는 쪽을 찍어 주세요. 옆 건물이 없으면 주변이 보이게 찍어 주세요.',
    capture: 'PHOTOS',
    requirement: 'REQUIRED',
    minPhotos: 1,
    why: '가설 방음벽·비계 설치와 인접 건물 보호(손상 분쟁) 비용을 판단한다.',
  },
];

export function remoteSurveyItem(id: RemoteSurveyItemId): RemoteSurveyItem | undefined {
  return REMOTE_SURVEY_ITEMS.find((item) => item.id === id);
}

export function isRemoteSurveyItemId(value: unknown): value is RemoteSurveyItemId {
  return typeof value === 'string' && REMOTE_SURVEY_ITEMS.some((item) => item.id === value);
}

// ────────────────────────────────────────────────────────────────────────────
// 질문지(사진으로 판단할 수 없는 것)
// ────────────────────────────────────────────────────────────────────────────

/** 있다/없다/모름. 모름도 정답이다 — 추측해서 "없다"라고 답하는 것보다 낫다. */
export type SurveyTriState = 'YES' | 'NO' | 'UNKNOWN';

export type RemoteSurveyRoofType =
  | 'SLATE' // 슬레이트(석면 의심)
  | 'CONCRETE' // 콘크리트 평지붕
  | 'TILE' // 기와
  | 'METAL' // 철판·샌드위치 패널
  | 'SHINGLE' // 아스팔트 슁글
  | 'UNKNOWN';

export const REMOTE_SURVEY_ROOF_LABELS: Record<RemoteSurveyRoofType, string> = {
  SLATE: '슬레이트',
  CONCRETE: '콘크리트(평평한 지붕)',
  TILE: '기와',
  METAL: '철판·패널',
  SHINGLE: '슁글',
  UNKNOWN: '모름',
};

/**
 * 진입로 폭 구간. 정확한 미터보다 **장비가 들어가느냐**가 중요해서 구간으로 받는다.
 * 경계값은 장비 기준이다: 2m 미만 = 인력·소형, 2~3m = 소형 굴착기·1톤, 3~4m = 5톤 덤프,
 * 4m 이상 = 대형 장비.
 */
export type AccessWidthBucket =
  'UNDER_2M' | 'FROM_2M_TO_3M' | 'FROM_3M_TO_4M' | 'OVER_4M' | 'UNKNOWN';

export const ACCESS_WIDTH_LABELS: Record<AccessWidthBucket, string> = {
  UNDER_2M: '2m 안 됨(사람만 지나감)',
  FROM_2M_TO_3M: '2~3m(작은 트럭)',
  FROM_3M_TO_4M: '3~4m(큰 트럭 한 대)',
  OVER_4M: '4m 넘음(넓음)',
  UNKNOWN: '모름',
};

export const SURVEY_TRI_STATE_LABELS: Record<SurveyTriState, string> = {
  YES: '있어요',
  NO: '없어요',
  UNKNOWN: '모르겠어요',
};

export interface RemoteSurveyAnswers {
  /** 지하층이 있는가. YES 면 지하 입구 사진이 필수가 된다. */
  basement?: SurveyTriState;
  /** 지상 층수(1 이상). */
  floorsAboveGround?: number;
  roofType?: RemoteSurveyRoofType;
  /** 석면이 있다고 들은 적이 있는가(건축물대장·이전 조사). */
  knownAsbestos?: SurveyTriState;
  /** 지금 비어 있는가(사람·짐이 없는가). 짐이 있으면 생활폐기물 처리가 따로 붙는다. */
  buildingEmpty?: boolean;
  accessWidth?: AccessWidthBucket;
  /** 자유 메모(선택). */
  notes?: string;
}

/** 제출 전에 반드시 답해야 하는 질문. 메모는 선택이다. */
export const REQUIRED_ANSWER_KEYS = [
  'basement',
  'floorsAboveGround',
  'roofType',
  'knownAsbestos',
  'buildingEmpty',
  'accessWidth',
] as const satisfies readonly (keyof RemoteSurveyAnswers)[];

// ────────────────────────────────────────────────────────────────────────────
// 패키지 본체
// ────────────────────────────────────────────────────────────────────────────

export type RemoteSurveyStatus = 'DRAFT' | 'SUBMITTED';

/** 방 한 칸 — 가이드 촬영 슬롯별 사진 key. */
export interface RemoteSurveyRoom {
  id: string;
  /** 사용자가 붙인 이름(거실·안방·주방·화장실·계단실…). */
  name: string;
  photoKeys: Partial<Record<SiteCaptureSlotId, string[]>>;
}

export interface RemoteSurvey {
  id: string;
  requestId: string;
  requesterId: string;
  status: RemoteSurveyStatus;
  rooms: RemoteSurveyRoom[];
  /** 항목별 사진 key(EXTERIOR·클로즈업). ROOMS 는 `rooms` 에 있다. */
  items: Partial<Record<RemoteSurveyItemId, string[]>>;
  answers: RemoteSurveyAnswers;
  /** 외부 3D 스캔 잡 id([[site-scan-3d]]). 있으면 외부 사진 4장을 대신한다. */
  scanJobId?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

/** 진행률 계산 단위 — 체크리스트 항목 + 질문지 하나. */
export type RemoteSurveyRequirementId = RemoteSurveyItemId | 'QUESTIONNAIRE';

/** 가이드 촬영에서 반드시 채워야 하는 슬롯(손상부위 같은 선택 슬롯 제외). */
export const REQUIRED_ROOM_SLOTS: readonly SiteCaptureSlotId[] = SITE_CAPTURE_SLOTS.filter(
  (slot) => !slot.optional,
).map((slot) => slot.id);

/** 이 방의 필수 슬롯이 모두 찍혔는가. */
export function isRoomComplete(room: RemoteSurveyRoom): boolean {
  return REQUIRED_ROOM_SLOTS.every((slot) => (room.photoKeys[slot]?.length ?? 0) > 0);
}

/** 답변 기준으로 이 항목이 지금 필수인가. */
export function isItemRequired(item: RemoteSurveyItem, answers: RemoteSurveyAnswers): boolean {
  if (item.requirement === 'REQUIRED') return true;
  if (item.requirement === 'IF_BASEMENT') return answers.basement === 'YES';
  return false;
}

/** 항목 하나가 채워졌는가(필수 여부와 무관). */
export function isItemDone(survey: RemoteSurvey, item: RemoteSurveyItem): boolean {
  if (item.capture === 'ROOMS') {
    return survey.rooms.length > 0 && survey.rooms.every(isRoomComplete);
  }
  const count = survey.items[item.id]?.length ?? 0;
  if (item.capture === 'SCAN_OR_PHOTOS' && survey.scanJobId) return true;
  return count >= item.minPhotos;
}

export function isQuestionnaireDone(answers: RemoteSurveyAnswers): boolean {
  return REQUIRED_ANSWER_KEYS.every((key) => answers[key] !== undefined);
}

export interface RemoteSurveyCompleteness {
  /** 필수 중 끝난 비율(0~1). 화면 진행 막대에 그대로 쓴다. */
  ratio: number;
  /** 끝난 필수 수 / 전체 필수 수 — "5/9 완료" 표시용. */
  doneRequired: number;
  totalRequired: number;
  /** 남은 필수 — 체크리스트 순서 그대로, 질문지는 맨 뒤. */
  missingRequired: RemoteSurveyRequirementId[];
}

/**
 * 패키지가 얼마나 찼는가. 화면(진행 막대)과 서버(제출 게이트)가 같은 답을 내야 해서 여기 하나로 둔다.
 * 질문지도 필수 하나로 센다 — 지하·석면은 사진으로 판단할 수 없다.
 */
export function computeSurveyCompleteness(survey: RemoteSurvey): RemoteSurveyCompleteness {
  const missingRequired: RemoteSurveyRequirementId[] = [];
  let totalRequired = 0;
  for (const item of REMOTE_SURVEY_ITEMS) {
    if (!isItemRequired(item, survey.answers)) continue;
    totalRequired += 1;
    if (!isItemDone(survey, item)) missingRequired.push(item.id);
  }
  totalRequired += 1;
  if (!isQuestionnaireDone(survey.answers)) missingRequired.push('QUESTIONNAIRE');

  const doneRequired = totalRequired - missingRequired.length;
  return {
    ratio: totalRequired === 0 ? 1 : doneRequired / totalRequired,
    doneRequired,
    totalRequired,
    missingRequired,
  };
}

export interface RemoteSurveyGateResult {
  ok: boolean;
  error?: string;
}

/** 제출 가능한가 — 필수가 전부 끝났고 아직 제출 전이어야 한다. */
export function canSubmitRemoteSurvey(survey: RemoteSurvey): RemoteSurveyGateResult {
  if (survey.status === 'SUBMITTED') return { ok: false, error: '이미 보낸 자료입니다.' };
  const { missingRequired } = computeSurveyCompleteness(survey);
  if (missingRequired.length > 0) {
    const names = missingRequired.map((id) =>
      id === 'QUESTIONNAIRE' ? '질문 답하기' : (remoteSurveyItem(id)?.title ?? id),
    );
    return { ok: false, error: `아직 남은 항목이 있어요: ${names.join(', ')}` };
  }
  return { ok: true };
}

/**
 * 석면 의심 신호 — 슬레이트 지붕이거나 석면이 있다고 들은 적이 있다.
 * 업체 화면에서 가장 먼저 띄워야 하는 값이라 공통 판정으로 둔다.
 */
export function remoteSurveyAsbestosSuspected(answers: RemoteSurveyAnswers): boolean {
  return answers.roofType === 'SLATE' || answers.knownAsbestos === 'YES';
}

// ────────────────────────────────────────────────────────────────────────────
// 열람 권한 — 소비자 본인 + 이 요청의 철거 견적에 참여한 업체
// ────────────────────────────────────────────────────────────────────────────

/** 권한 판정에 필요한 견적 필드만 — 견적 저장소 전체를 끌고 오지 않는다. */
export interface EstimateParticipant {
  providerId: string;
  stage: string;
}

/**
 * 이 요청의 철거 견적에 **지금 참여 중인** 업체 id 목록.
 * 떨어진(DECLINED) 업체는 뺀다 — 선정이 끝난 뒤에도 남의 집 내부 사진을 볼 이유가 없다.
 * 매칭된 업체는 견적이 없어도(운영 보정 등) 포함한다.
 */
export function remoteSurveyProviderIds(
  estimates: readonly EstimateParticipant[],
  matchedProviderId?: string,
): string[] {
  const ids = new Set(estimates.filter((e) => e.stage !== 'DECLINED').map((e) => e.providerId));
  if (matchedProviderId) ids.add(matchedProviderId);
  return [...ids];
}

// ────────────────────────────────────────────────────────────────────────────
// 추가 촬영 요청 — 업체: "이것 더 찍어 주세요" → 소비자: 찍어서 보내기
// ────────────────────────────────────────────────────────────────────────────

export type RemoteSurveyShotRequestStatus = 'OPEN' | 'FULFILLED';

export interface RemoteSurveyShotRequest {
  id: string;
  surveyId: string;
  requestId: string;
  providerId: string;
  /** 체크리스트 항목에 대한 요청이면 그 id. 없으면 자유 문구 요청(message 만). */
  itemId?: RemoteSurveyItemId;
  /** 업체가 쓴 요청 문구 — 소비자에게 그대로 보인다. */
  message: string;
  status: RemoteSurveyShotRequestStatus;
  /** 소비자가 찍어 보낸 사진 key. */
  photoKeys: string[];
  createdAt: string;
  fulfilledAt?: string;
}

/** 이 업체가 이 패키지에 추가 요청을 더 보낼 수 있는가. */
export function canOpenMoreShotRequests(
  requests: readonly RemoteSurveyShotRequest[],
  providerId: string,
): boolean {
  const open = requests.filter((r) => r.providerId === providerId && r.status === 'OPEN');
  return open.length < REMOTE_SURVEY_MAX_OPEN_SHOT_REQUESTS_PER_PROVIDER;
}

/**
 * 밀봉 가시성 — 업체는 자기가 보낸 요청만 본다(남의 질문으로 남의 견적 방향을 읽지 않게).
 * 소비자는 전부 본다. [[demolition-estimate]] visibleDemolitionEstimates 와 같은 원칙.
 */
export function visibleShotRequests(
  requests: readonly RemoteSurveyShotRequest[],
  viewerId: string,
  requesterId: string,
): RemoteSurveyShotRequest[] {
  if (viewerId === requesterId) return [...requests];
  return requests.filter((r) => r.providerId === viewerId);
}

// ────────────────────────────────────────────────────────────────────────────
// 입력 검증(서버가 외부 입력을 받을 때) — 순수 함수
// ────────────────────────────────────────────────────────────────────────────

export type RemoteSurveyParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 사진 key 배열 — 서버가 발급한 형식만, 중복 제거, 상한 적용. */
export function parsePhotoKeys(raw: unknown, field: string): RemoteSurveyParseResult<string[]> {
  if (!Array.isArray(raw)) return { ok: false, error: `${field}: 사진 목록이 필요합니다.` };
  const keys = [...new Set(raw)];
  if (keys.some((k) => typeof k !== 'string' || !isValidSitePhotoKey(k))) {
    return { ok: false, error: `${field}: 올바르지 않은 사진이 있습니다. 다시 찍어 주세요.` };
  }
  if (keys.length > REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM) {
    return {
      ok: false,
      error: `${field}: 사진은 ${REMOTE_SURVEY_MAX_PHOTOS_PER_ITEM}장까지 넣을 수 있어요.`,
    };
  }
  return { ok: true, value: keys as string[] };
}

/** 방 목록. id 가 없으면 newId 로 만든다(새로 추가한 방). */
export function parseRemoteSurveyRooms(
  raw: unknown,
  newId: () => string,
): RemoteSurveyParseResult<RemoteSurveyRoom[]> {
  if (!Array.isArray(raw)) return { ok: false, error: '방 목록 형식이 올바르지 않습니다.' };
  if (raw.length > REMOTE_SURVEY_MAX_ROOMS) {
    return { ok: false, error: `방은 ${REMOTE_SURVEY_MAX_ROOMS}개까지 넣을 수 있어요.` };
  }
  const rooms: RemoteSurveyRoom[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: '방 목록 형식이 올바르지 않습니다.' };
    }
    const { id, name, photoKeys } = entry as Record<string, unknown>;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > REMOTE_SURVEY_ROOM_NAME_MAX) {
      return {
        ok: false,
        error: `방 이름을 ${REMOTE_SURVEY_ROOM_NAME_MAX}자 이내로 적어 주세요.`,
      };
    }
    const roomId = typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id) ? id : newId();
    if (seen.has(roomId)) return { ok: false, error: '같은 방이 두 번 들어 있습니다.' };
    seen.add(roomId);

    const slots: Partial<Record<SiteCaptureSlotId, string[]>> = {};
    if (photoKeys !== undefined) {
      if (typeof photoKeys !== 'object' || photoKeys === null) {
        return { ok: false, error: '방 사진 형식이 올바르지 않습니다.' };
      }
      for (const [slotId, keys] of Object.entries(photoKeys)) {
        if (!SITE_CAPTURE_SLOTS.some((s) => s.id === slotId)) {
          return { ok: false, error: '알 수 없는 촬영 위치가 있습니다.' };
        }
        const parsed = parsePhotoKeys(keys, trimmed);
        if (!parsed.ok) return parsed;
        if (parsed.value.length > 0) slots[slotId as SiteCaptureSlotId] = parsed.value;
      }
    }
    rooms.push({ id: roomId, name: trimmed, photoKeys: slots });
  }
  return { ok: true, value: rooms };
}

/** 항목별 사진. ROOMS 는 방 목록으로만 받는다. */
export function parseRemoteSurveyItems(
  raw: unknown,
): RemoteSurveyParseResult<Partial<Record<RemoteSurveyItemId, string[]>>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '항목 사진 형식이 올바르지 않습니다.' };
  }
  const items: Partial<Record<RemoteSurveyItemId, string[]>> = {};
  for (const [itemId, keys] of Object.entries(raw)) {
    if (!isRemoteSurveyItemId(itemId) || itemId === 'ROOMS') {
      return { ok: false, error: '알 수 없는 촬영 항목이 있습니다.' };
    }
    const parsed = parsePhotoKeys(keys, remoteSurveyItem(itemId)!.title);
    if (!parsed.ok) return parsed;
    if (parsed.value.length > 0) items[itemId] = parsed.value;
  }
  return { ok: true, value: items };
}

const SURVEY_TRI_STATES: readonly SurveyTriState[] = ['YES', 'NO', 'UNKNOWN'];

/** 질문지. 모르는 키는 버리고, 아는 키는 값까지 검증한다. */
export function parseRemoteSurveyAnswers(
  raw: unknown,
): RemoteSurveyParseResult<RemoteSurveyAnswers> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '답변 형식이 올바르지 않습니다.' };
  }
  const r = raw as Record<string, unknown>;
  const answers: RemoteSurveyAnswers = {};

  for (const key of ['basement', 'knownAsbestos'] as const) {
    if (r[key] === undefined) continue;
    if (!SURVEY_TRI_STATES.includes(r[key] as SurveyTriState)) {
      return { ok: false, error: '있어요/없어요/모르겠어요 중에서 골라 주세요.' };
    }
    answers[key] = r[key] as SurveyTriState;
  }
  if (r.floorsAboveGround !== undefined) {
    const floors = r.floorsAboveGround;
    if (
      typeof floors !== 'number' ||
      !Number.isInteger(floors) ||
      floors < 1 ||
      floors > REMOTE_SURVEY_MAX_FLOORS
    ) {
      return { ok: false, error: `층수는 1~${REMOTE_SURVEY_MAX_FLOORS} 사이 숫자로 적어 주세요.` };
    }
    answers.floorsAboveGround = floors;
  }
  if (r.roofType !== undefined) {
    if (!(typeof r.roofType === 'string' && r.roofType in REMOTE_SURVEY_ROOF_LABELS)) {
      return { ok: false, error: '지붕 종류를 골라 주세요.' };
    }
    answers.roofType = r.roofType as RemoteSurveyRoofType;
  }
  if (r.buildingEmpty !== undefined) {
    if (typeof r.buildingEmpty !== 'boolean') {
      return { ok: false, error: '건물이 비어 있는지 골라 주세요.' };
    }
    answers.buildingEmpty = r.buildingEmpty;
  }
  if (r.accessWidth !== undefined) {
    if (!(typeof r.accessWidth === 'string' && r.accessWidth in ACCESS_WIDTH_LABELS)) {
      return { ok: false, error: '길 폭을 골라 주세요.' };
    }
    answers.accessWidth = r.accessWidth as AccessWidthBucket;
  }
  if (r.notes !== undefined) {
    if (typeof r.notes !== 'string' || r.notes.length > REMOTE_SURVEY_TEXT_MAX) {
      return { ok: false, error: `메모는 ${REMOTE_SURVEY_TEXT_MAX}자까지 적을 수 있어요.` };
    }
    const notes = r.notes.trim();
    if (notes) answers.notes = notes;
  }
  return { ok: true, value: answers };
}
