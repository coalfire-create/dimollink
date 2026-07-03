import { randomUUID } from 'node:crypto';
import {
  PILOT,
  REQUEST_KINDS,
  REQUEST_STATUS_LABELS,
  SITE_PHOTOS_MAX_PER_REQUEST,
  canTransitionRequestStatus,
  isValidGeoPoint,
  isValidSitePhotoKey,
  type GeoPoint,
  type MatchStatus,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 서비스 요청(철거/운반/처리장예약) 저장소 + 상태 관리.
 * 파일럿 단계: 영속화는 persistence 어댑터에 위임 (기본 JSON 파일,
 * PostgreSQL 연동 시 어댑터만 교체하고 검증·전이 규칙은 유지).
 */

export class RequestValidationError extends Error {}

/** 저장 어댑터 — 부팅 시 로드, 변경 시 전체 스냅샷 저장. */
export type RequestPersistence = CollectionPersistence<ServiceRequest>;

/** 종류별 생성 입력 (id/status/createdAt 등 서버 생성 필드 제외). */
export interface CreateRequestInput {
  kind: RequestKind;
  requesterId: string;
  region: string;
  wasteCategory: string;
  wasteTons: number;
  allbaroRequested: boolean;
  sitePhotoKeys?: string[];
  /** 현장 좌표(거리 기반 일감 추천용, 선택). */
  location?: GeoPoint;
  /** DEMOLITION */
  siteAddress?: string;
  /** TRANSPORT */
  loadAddress?: string;
  unloadAddress?: string;
  /** DISPOSAL_RESERVATION */
  visitAt?: string;
}

export interface ListRequestsFilter {
  requesterId?: string;
  kind?: RequestKind;
  status?: MatchStatus;
  /** 매칭 확정된 업체 id (업체 일감 피드 — 내가 수락한 요청 조회용). */
  providerId?: string;
  /** 현장 지역 필터 (파일럿 양평). */
  region?: string;
}

export interface StatusChangeOptions {
  /** MATCHED 전이 시 필수 — 매칭 확정된 업체 id. */
  matchedProviderId?: string;
  /** CANCELLED 전이 시 선택 — 취소 사유. */
  cancelReason?: string;
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestValidationError(message);
  }
  return value.trim();
}

/** 사진 키 목록 검증 + 중복 제거 (서버 발급 형식만 허용 — 외부 URL 주입 차단). */
function normalizeSitePhotoKeys(keys: unknown): string[] {
  if (keys === undefined) return [];
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) {
    throw new RequestValidationError('sitePhotoKeys 는 문자열 배열이어야 합니다.');
  }
  const unique = [...new Set(keys as string[])];
  if (unique.length > SITE_PHOTOS_MAX_PER_REQUEST) {
    throw new RequestValidationError(
      `현장 사진은 요청당 최대 ${SITE_PHOTOS_MAX_PER_REQUEST}장까지 첨부할 수 있습니다.`,
    );
  }
  for (const key of unique) {
    if (!isValidSitePhotoKey(key)) {
      throw new RequestValidationError(`유효하지 않은 사진 키입니다: ${key}`);
    }
  }
  return unique;
}

/** 상태 전이 리스너 — 매칭 단계별 알림(Phase 4) 등이 연결된다. */
export type StatusChangeListener = (request: ServiceRequest, from: MatchStatus) => void;

export class RequestStore {
  private readonly requests = new Map<string, ServiceRequest>();

  constructor(
    private readonly persistence?: RequestPersistence,
    private readonly onStatusChange?: StatusChangeListener,
  ) {
    for (const request of persistence?.load() ?? []) {
      this.requests.set(request.id, request);
    }
  }

  private persist(): void {
    this.persistence?.save([...this.requests.values()]);
  }

  create(input: CreateRequestInput): ServiceRequest {
    if (!REQUEST_KINDS.includes(input.kind)) {
      throw new RequestValidationError(`kind 는 ${REQUEST_KINDS.join(' | ')} 중 하나여야 합니다.`);
    }
    const requesterId = requireText(input.requesterId, 'requesterId 가 필요합니다.');
    // 파일럿 범위 한정 (CLAUDE.md 핵심 비즈니스 규칙): 양평 · 건설폐기물.
    if (input.region !== PILOT.region) {
      throw new RequestValidationError(
        `파일럿 기간에는 ${PILOT.region} 지역만 접수할 수 있습니다.`,
      );
    }
    if (input.wasteCategory !== PILOT.wasteCategory) {
      throw new RequestValidationError('파일럿 기간에는 건설폐기물만 접수할 수 있습니다.');
    }
    if (!Number.isFinite(input.wasteTons) || input.wasteTons <= 0) {
      throw new RequestValidationError('wasteTons(예상 중량, 톤)은 양수여야 합니다.');
    }
    if (input.location !== undefined && !isValidGeoPoint(input.location)) {
      throw new RequestValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }

    const now = new Date().toISOString();
    const base = {
      id: randomUUID(),
      requesterId,
      region: input.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: input.wasteTons,
      allbaroRequested: input.allbaroRequested === true,
      sitePhotoKeys: normalizeSitePhotoKeys(input.sitePhotoKeys),
      ...(input.location ? { location: input.location } : {}),
      status: 'REQUESTED' as const,
      createdAt: now,
      updatedAt: now,
    };

    let request: ServiceRequest;
    switch (input.kind) {
      case 'DEMOLITION':
        request = {
          ...base,
          kind: 'DEMOLITION',
          siteAddress: requireText(input.siteAddress, '철거요청에는 siteAddress(현장 주소)가 필요합니다.'),
        };
        break;
      case 'TRANSPORT':
        request = {
          ...base,
          kind: 'TRANSPORT',
          loadAddress: requireText(input.loadAddress, '운반요청에는 loadAddress(상차지 주소)가 필요합니다.'),
          unloadAddress: requireText(input.unloadAddress, '운반요청에는 unloadAddress(하차지 주소)가 필요합니다.'),
        };
        break;
      case 'DISPOSAL_RESERVATION': {
        const visitAt = requireText(input.visitAt, '처리장예약에는 visitAt(방문 일시)가 필요합니다.');
        if (Number.isNaN(Date.parse(visitAt))) {
          throw new RequestValidationError('visitAt 은 ISO 8601 일시여야 합니다.');
        }
        request = { ...base, kind: 'DISPOSAL_RESERVATION', visitAt };
        break;
      }
    }

    this.requests.set(request.id, request);
    this.persist();
    return request;
  }

  get(id: string): ServiceRequest | undefined {
    return this.requests.get(id);
  }

  /** 최신순 목록. 요청자/종류/상태 필터 지원 (프론트 목록 화면용). */
  list(filter: ListRequestsFilter = {}): ServiceRequest[] {
    return [...this.requests.values()]
      .filter(
        (r) =>
          (filter.requesterId === undefined || r.requesterId === filter.requesterId) &&
          (filter.kind === undefined || r.kind === filter.kind) &&
          (filter.status === undefined || r.status === filter.status) &&
          (filter.providerId === undefined || r.matchedProviderId === filter.providerId) &&
          (filter.region === undefined || r.region === filter.region),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 상태 전이. `REQUEST_STATUS_TRANSITIONS` 에 정의된 전이만 허용한다.
   * (작업 시작 후 취소 불가 — 취소 정책의 상태 규칙. 환불액 계산은 정산 모듈 몫.)
   */
  changeStatus(id: string, to: MatchStatus, options: StatusChangeOptions = {}): ServiceRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new RequestValidationError('요청을 찾을 수 없습니다.');
    }
    if (!canTransitionRequestStatus(request.status, to)) {
      throw new RequestValidationError(
        `'${REQUEST_STATUS_LABELS[request.status]}' 상태에서 '${REQUEST_STATUS_LABELS[to]}' 로 변경할 수 없습니다.`,
      );
    }
    if (to === 'MATCHED' && !options.matchedProviderId) {
      throw new RequestValidationError('매칭완료 처리에는 matchedProviderId 가 필요합니다.');
    }

    const updated: ServiceRequest = {
      ...request,
      status: to,
      updatedAt: new Date().toISOString(),
      ...(to === 'MATCHED' ? { matchedProviderId: options.matchedProviderId } : {}),
      ...(to === 'CANCELLED' && options.cancelReason ? { cancelReason: options.cancelReason } : {}),
    };
    this.requests.set(id, updated);
    this.persist();
    try {
      this.onStatusChange?.(updated, request.status);
    } catch {
      // 리스너(알림 등) 오류가 상태 전이를 실패시키면 안 된다.
    }
    return updated;
  }

  /** 현장 사진 추가 연결. 취소/정산완료된 요청에는 첨부 불가. */
  attachSitePhotos(id: string, keys: string[]): ServiceRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new RequestValidationError('요청을 찾을 수 없습니다.');
    }
    if (request.status === 'CANCELLED' || request.status === 'SETTLED') {
      throw new RequestValidationError(
        `'${REQUEST_STATUS_LABELS[request.status]}' 상태의 요청에는 사진을 첨부할 수 없습니다.`,
      );
    }
    const merged = normalizeSitePhotoKeys([...request.sitePhotoKeys, ...keys]);
    const updated: ServiceRequest = {
      ...request,
      sitePhotoKeys: merged,
      updatedAt: new Date().toISOString(),
    };
    this.requests.set(id, updated);
    this.persist();
    return updated;
  }
}
