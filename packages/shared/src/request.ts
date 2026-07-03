import type { GeoPoint } from './geo.js';
import type { MatchStatus, WasteCategory } from './types.js';
import type { UserType } from './user.js';

/**
 * 서비스 요청 3종 (철거요청 / 운반요청 / 처리장예약 · 로드맵 Phase 1 §4.2).
 * 프론트(안티그래비티 화면)와 백엔드가 같은 타입·상태 규칙을 공유한다.
 */

export type RequestKind =
  | 'DEMOLITION' // 철거요청
  | 'TRANSPORT' // 운반요청
  | 'DISPOSAL_RESERVATION'; // 처리장 예약

export const REQUEST_KINDS: readonly RequestKind[] = [
  'DEMOLITION',
  'TRANSPORT',
  'DISPOSAL_RESERVATION',
];

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  DEMOLITION: '철거요청',
  TRANSPORT: '운반요청',
  DISPOSAL_RESERVATION: '처리장예약',
};

/**
 * 가입 유형 → 그 업체가 수행(수락)하는 요청 종류.
 * 소비자(CONSUMER)는 수행 주체가 아니라 매핑이 없다.
 * - 철거업체: 철거요청, 운반업체: 운반요청, 처리장: 처리장예약.
 */
export const REQUEST_KIND_BY_USER_TYPE: Partial<Record<UserType, RequestKind>> = {
  DEMOLITION_COMPANY: 'DEMOLITION',
  TRANSPORT_COMPANY: 'TRANSPORT',
  WASTE_TREATMENT_PLANT: 'DISPOSAL_RESERVATION',
};

/** 업체가 수락 가능한 요청 종류. 대상이 아니면(소비자) undefined. */
export function requestKindForProvider(userType: UserType): RequestKind | undefined {
  return REQUEST_KIND_BY_USER_TYPE[userType];
}

/**
 * 거리 정보가 붙은 일감(요청) — 업체 기준 좌표로부터의 직선거리(km).
 * 좌표가 없어 거리를 계산할 수 없으면 distanceKm 은 null.
 */
export type RankedJob = ServiceRequest & { distanceKm: number | null };

/**
 * 업체 일감 피드 응답.
 * - open: 아직 수락되지 않은(REQUESTED) 내 유형·지역 요청. 가까운 순으로 정렬(거리 기반 매칭).
 * - assigned: 내가 수락해 진행 중인 요청.
 */
export interface ProviderJobs {
  open: RankedJob[];
  assigned: ServiceRequest[];
}

interface ServiceRequestBase {
  id: string;
  kind: RequestKind;
  /** 요청 주체(배출자/철거업체) id. */
  requesterId: string;
  /** 현장 지역. 파일럿에서는 양평만 접수한다. */
  region: string;
  wasteCategory: WasteCategory;
  /** 예상 폐기물 중량(톤). 올바로 의무신고(5톤 이상) 안내 기준. */
  wasteTons: number;
  /**
   * 현장 좌표(철거 현장/상차지/처리장 방문지). 거리 기반 일감 추천에 사용한다.
   * 미입력이면 업체 목록에서 거리 정렬 없이 최신순으로 노출된다.
   */
  location?: GeoPoint;
  /** "올바로 전자인계서 신고 필요" 체크박스 값. */
  allbaroRequested: boolean;
  /** 현장 사진 오브젝트 키 목록 (`isValidSitePhotoKey` 형식만 허용). */
  sitePhotoKeys: string[];
  status: MatchStatus;
  /** 매칭 확정된 업체 id (MATCHED 전이 시 기록). */
  matchedProviderId?: string;
  /**
   * 합의 금액(원) — 선착순 수락 시 업체가 제시한 금액. 선결제 청구 기준.
   * 견적 비교(처리장) 방식은 수락된 견적(Quote)에서 금액을 산출하므로 이 값이 없다.
   */
  agreedFee?: number;
  /** 취소 사유 (CANCELLED 전이 시 기록). */
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** 철거요청 — 철거 현장 주소 기반. */
export interface DemolitionRequest extends ServiceRequestBase {
  kind: 'DEMOLITION';
  /** 철거 현장 주소. */
  siteAddress: string;
}

/** 운반요청 — 상차지 → 하차지. */
export interface TransportRequest extends ServiceRequestBase {
  kind: 'TRANSPORT';
  /** 상차지 주소. */
  loadAddress: string;
  /** 하차지 주소. */
  unloadAddress: string;
}

/** 처리장 예약 — 방문 일시 기반. */
export interface DisposalReservation extends ServiceRequestBase {
  kind: 'DISPOSAL_RESERVATION';
  /** 처리장 방문 일시(ISO 8601). */
  visitAt: string;
}

export type ServiceRequest = DemolitionRequest | TransportRequest | DisposalReservation;

/** 상태 한글 라벨 — 화면 표기용 (프론트에서 그대로 사용). */
export const REQUEST_STATUS_LABELS: Record<MatchStatus, string> = {
  REQUESTED: '대기중',
  MATCHED: '매칭완료',
  PAID: '결제완료',
  IN_PROGRESS: '진행중',
  COMPLETED: '처리완료',
  SETTLED: '정산완료',
  CANCELLED: '취소됨',
};

/**
 * 허용되는 상태 전이.
 * 취소는 작업 시작(IN_PROGRESS) 전까지만 가능 — CLAUDE.md 취소 정책
 * ("반출/상차 등 작업 시작 후에는 원칙적으로 취소 불가")의 상태 전이 반영.
 * 취소 시 환불액 계산(전액/위약금 10% 공제)은 정산 모듈의 몫이며 여기서 다루지 않는다.
 */
export const REQUEST_STATUS_TRANSITIONS: Record<MatchStatus, readonly MatchStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['PAID', 'CANCELLED'],
  PAID: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['SETTLED'],
  SETTLED: [],
  CANCELLED: [],
};

export function canTransitionRequestStatus(from: MatchStatus, to: MatchStatus): boolean {
  return REQUEST_STATUS_TRANSITIONS[from].includes(to);
}

/** 취소 가능 상태인지 (작업 시작 전). 프론트의 취소 버튼 노출 조건과 동일해야 한다. */
export function isRequestCancellable(status: MatchStatus): boolean {
  return canTransitionRequestStatus(status, 'CANCELLED');
}
