import type { MatchStatus, WasteCategory } from './types.js';

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
  /** "올바로 전자인계서 신고 필요" 체크박스 값. */
  allbaroRequested: boolean;
  /** 현장 사진 오브젝트 키 목록 (`isValidSitePhotoKey` 형식만 허용). */
  sitePhotoKeys: string[];
  status: MatchStatus;
  /** 매칭 확정된 업체 id (MATCHED 전이 시 기록). */
  matchedProviderId?: string;
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
