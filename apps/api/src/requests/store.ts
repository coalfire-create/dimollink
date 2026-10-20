import { randomUUID } from 'node:crypto';
import {
  PILOT,
  REQUEST_KINDS,
  REQUEST_STATUS_LABELS,
  SITE_PHOTOS_MAX_PER_REQUEST,
  canTransitionRequestStatus,
  isValidGeoPoint,
  isValidSitePhotoKey,
  isValidWasteItem,
  regionMatches,
  wasteItemsToTons,
  type DemolitionDetails,
  type GeoPoint,
  type ManifestResult,
  type MatchStatus,
  type RequestKind,
  type ServiceRequest,
  type WasteItem,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

export class RequestValidationError extends Error {}

export type RequestPersistence = CollectionPersistence<ServiceRequest>;

export interface CreateRequestInput {
  kind: RequestKind;
  requesterId: string;
  region: string;
  wasteCategory: string;
  wasteItems?: WasteItem[];
  wasteTons?: number;
  allbaroRequested: boolean;
  sitePhotoKeys?: string[];
  location?: GeoPoint;
  linkedRequestId?: string;
  siteAddress?: string;
  demolitionDetails?: DemolitionDetails;
  loadAddress?: string;
  unloadAddress?: string;
  visitAt?: string;
}

export interface ListRequestsFilter {
  requesterId?: string;
  kind?: RequestKind;
  status?: MatchStatus;
  providerId?: string;
  region?: string;
}

export interface StatusChangeOptions {
  matchedProviderId?: string;
  agreedFee?: number;
  paymentId?: string;
  cancelReason?: string;
  /**
   * 관리자 개입 — 정상 전이 규칙을 건너뛴다.
   *
   * 왜 필요한가: 업체가 배차만 하고 잠수하거나 배출자가 결제 후 연락이 끊기면 요청이
   * 중간 상태에 영원히 멈춘다. 참여자만 상태를 바꿀 수 있어서 아무도 풀 수 없고,
   * 정산 큐에도 안 잡힌다. 분쟁 조정은 예외 경로가 있어야 성립한다.
   *
   * 강제여도 지키는 것:
   *  - 정산완료(SETTLED)에서는 못 나온다. 돈이 이미 나간 뒤라 되돌리면 장부가 깨진다.
   *  - 매칭완료로 갈 때는 여전히 업체가 필요하다(누구와 매칭됐는지 없는 매칭은 성립 불가).
   * 사유를 필수로 받는 이유는, 사유 없는 개입은 나중에 아무도 설명할 수 없기 때문이다.
   */
  adminOverride?: { reason: string; actorId?: string };
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RequestValidationError(message);
  }
  return value.trim();
}

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

function normalizeWasteItems(items: unknown, legacyTons: unknown, kind?: RequestKind): WasteItem[] {
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      if (kind === 'DEMOLITION') return [];
      throw new RequestValidationError(
        '소재별 폐기물 항목(wasteItems)을 1개 이상 입력해야 합니다.',
      );
    }
    return items.map((raw) => {
      if (!isValidWasteItem(raw)) {
        throw new RequestValidationError(
          '각 폐기물 항목은 유효한 소재(12종)와 양수 kg 이어야 합니다.',
        );
      }
      return { material: raw.material, kg: raw.kg };
    });
  }
  if (typeof legacyTons === 'number' && Number.isFinite(legacyTons) && legacyTons > 0) {
    return [{ material: 'MIXED_WASTE', kg: Math.round(legacyTons * 1000) }];
  }
  if (kind === 'DEMOLITION') return [];
  throw new RequestValidationError('소재별 폐기물 항목(wasteItems)을 1개 이상 입력해야 합니다.');
}

export type StatusChangeListener = (request: ServiceRequest, from: MatchStatus) => void | Promise<void>;
export type CreateListener = (request: ServiceRequest) => void | Promise<void>;

export class RequestStore {
  private readonly fallbackMap = new Map<string, ServiceRequest>();

  constructor(
    private readonly persistence?: RequestPersistence,
    private readonly onStatusChange?: StatusChangeListener,
    private readonly onCreate?: CreateListener,
  ) {}

  private async getInner(id: string): Promise<ServiceRequest | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  private async listInner(): Promise<ServiceRequest[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  /**
   * 완전일치로 좁힐 수 있는 조건(kind·status)은 저장소에 내려보내 전량 로드를 피한다.
   * region 은 표기 편차를 흡수해야 해서(regionMatches) 메모리에서 거른다.
   */
  private async listNarrowed(filter: ListRequestsFilter): Promise<ServiceRequest[]> {
    const equals: Record<string, string> = {};
    if (filter.kind !== undefined) equals.kind = filter.kind;
    if (filter.status !== undefined) equals.status = filter.status;
    if (this.persistence?.listBy && Object.keys(equals).length > 0) {
      return this.persistence.listBy(equals);
    }
    return this.listInner();
  }

  private async saveInner(req: ServiceRequest): Promise<void> {
    if (this.persistence) await this.persistence.save(req);
    else this.fallbackMap.set(req.id, req);
  }

  async create(input: CreateRequestInput): Promise<ServiceRequest> {
    if (!REQUEST_KINDS.includes(input.kind)) {
      throw new RequestValidationError(`kind 는 ${REQUEST_KINDS.join(' | ')} 중 하나여야 합니다.`);
    }
    const requesterId = requireText(input.requesterId, 'requesterId 가 필요합니다.');
    requireText(input.region, '지역(현장 지역)이 필요합니다.');
    if (input.wasteCategory !== PILOT.wasteCategory) {
      throw new RequestValidationError('건설폐기물만 접수할 수 있습니다.');
    }
    const wasteItems = normalizeWasteItems(input.wasteItems, input.wasteTons, input.kind);
    const wasteTons = input.kind === 'DEMOLITION' && input.wasteTons !== undefined 
      ? input.wasteTons 
      : wasteItemsToTons(wasteItems);
    if (input.location !== undefined && !isValidGeoPoint(input.location)) {
      throw new RequestValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }

    const now = new Date().toISOString();
    const base = {
      id: randomUUID(),
      requesterId,
      region: input.region.trim(),
      wasteCategory: PILOT.wasteCategory,
      wasteItems,
      wasteTons,
      allbaroRequested: input.allbaroRequested === true,
      sitePhotoKeys: normalizeSitePhotoKeys(input.sitePhotoKeys),
      ...(input.location ? { location: input.location } : {}),
      ...(input.linkedRequestId ? { linkedRequestId: input.linkedRequestId } : {}),
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
          siteAddress: requireText(
            input.siteAddress,
            '철거요청에는 siteAddress(현장 주소)가 필요합니다.',
          ),
          ...(input.demolitionDetails ? { demolitionDetails: input.demolitionDetails } : {}),
        };
        break;
      case 'TRANSPORT':
        request = {
          ...base,
          kind: 'TRANSPORT',
          loadAddress: requireText(
            input.loadAddress,
            '운반요청에는 loadAddress(상차지 주소)가 필요합니다.',
          ),
          unloadAddress: requireText(
            input.unloadAddress,
            '운반요청에는 unloadAddress(하차지 주소)가 필요합니다.',
          ),
        };
        break;
      case 'DISPOSAL_RESERVATION': {
        const visitAt = requireText(
          input.visitAt,
          '처리장예약에는 visitAt(방문 일시)가 필요합니다.',
        );
        if (Number.isNaN(Date.parse(visitAt))) {
          throw new RequestValidationError('visitAt 은 ISO 8601 일시여야 합니다.');
        }
        request = { ...base, kind: 'DISPOSAL_RESERVATION', visitAt };
        break;
      }
    }

    await this.saveInner(request);
    try {
      await this.onCreate?.(request);
    } catch {
      // 리스너 오류 무시
    }
    return request;
  }

  async get(id: string): Promise<ServiceRequest | undefined> {
    return this.getInner(id);
  }

  async list(filter: ListRequestsFilter = {}): Promise<ServiceRequest[]> {
    const all = await this.listNarrowed(filter);
    return all
      .filter(
        (r) =>
          (filter.requesterId === undefined || r.requesterId === filter.requesterId) &&
          (filter.kind === undefined || r.kind === filter.kind) &&
          (filter.status === undefined || r.status === filter.status) &&
          (filter.providerId === undefined || r.matchedProviderId === filter.providerId) &&
          (filter.region === undefined || regionMatches(r.region, filter.region)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async changeStatus(id: string, to: MatchStatus, options: StatusChangeOptions = {}): Promise<ServiceRequest> {
    const request = await this.getInner(id);
    if (!request) {
      throw new RequestValidationError('요청을 찾을 수 없습니다.');
    }
    const override = options.adminOverride;
    if (override) {
      if (override.reason.trim().length === 0) {
        throw new RequestValidationError('관리자 개입에는 사유가 필요합니다.');
      }
      if (request.status === 'SETTLED') {
        // 돈이 이미 나갔다. 여기서 되돌리면 장부와 실제 입금이 어긋난다.
        throw new RequestValidationError('정산완료 상태는 되돌릴 수 없습니다.');
      }
    } else if (!canTransitionRequestStatus(request.status, to)) {
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
      ...(to === 'MATCHED' && typeof options.agreedFee === 'number'
        ? { agreedFee: options.agreedFee }
        : {}),
      ...(to === 'PAID' && options.paymentId ? { paymentId: options.paymentId } : {}),
      ...(to === 'CANCELLED' && options.cancelReason ? { cancelReason: options.cancelReason } : {}),
    };
    
    if (override) {
      // 누가·무엇을·왜 바꿨는지 남긴다. 요청 내용에는 PII 가 있으므로 id 만 찍는다.
      console.warn(
        `[admin] 요청 상태 강제 변경 ${id}: ${request.status} → ${to} ` +
          `(by ${override.actorId ?? 'SHARED_TOKEN'}, 사유: ${override.reason})`,
      );
    }

    await this.saveInner(updated);
    try {
      await this.onStatusChange?.(updated, request.status);
    } catch {
      // 리스너 오류 무시
    }
    return updated;
  }

  async attachSitePhotos(id: string, keys: string[]): Promise<ServiceRequest> {
    const request = await this.getInner(id);
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
    await this.saveInner(updated);
    return updated;
  }

  /**
   * 전자인계서(또는 간이확인서) 발행 결과를 요청 레코드에 기록한다.
   * 장애 폴백(RETRY_QUEUED) 후 재시도 큐에서 올바로 발행(ALLBARO_API)에 성공하면
   * 임시 간이확인서 번호를 지우고 정식 인계서 번호로 대체한다.
   */
  async recordManifestResult(manifest: ManifestResult): Promise<ServiceRequest | undefined> {
    const request = await this.getInner(manifest.matchRequestId);
    if (!request) return undefined;

    const normalized: ManifestResult =
      manifest.route === 'ALLBARO_API'
        ? {
            matchRequestId: manifest.matchRequestId,
            route: 'ALLBARO_API',
            manifestNo: manifest.manifestNo,
            retryQueued: false,
            ...(manifest.environment ? { environment: manifest.environment } : {}),
            issuedAt: manifest.issuedAt,
          }
        : manifest;

    const updated: ServiceRequest = {
      ...request,
      allbaroManifest: normalized,
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  /**
   * 처리장 반입·계량(`/allbaro/disposal-info`)으로 확정된 실제 처리 중량(톤)을 요청에 기록한다.
   * matchRequestId 가 주어지면 해당 요청을, 없으면 인계서 번호(`manifestNo`)로 연결된 요청을 찾는다.
   */
  async recordActualWeighedTons(
    target: { matchRequestId?: string; manifestNo: string },
    weighedTons: number,
  ): Promise<ServiceRequest | undefined> {
    if (!Number.isFinite(weighedTons) || weighedTons <= 0) {
      throw new RequestValidationError('weighedTons 는 0보다 큰 숫자여야 합니다.');
    }
    let request = target.matchRequestId ? await this.getInner(target.matchRequestId) : undefined;
    if (!request && target.manifestNo) {
      const all = await this.listInner();
      request = all.find((r) => r.allbaroManifest?.manifestNo === target.manifestNo);
    }
    if (!request) return undefined;

    const updated: ServiceRequest = {
      ...request,
      actualWeighedTons: weighedTons,
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  /**
   * 요청 id 기준 실제 계량 톤수 조회(원격 견적 정합성 대사용).
   * 본인 요청에 직접 기록된 값이 있으면 그것을 쓰고, 없으면 이 요청에 연결된(`linkedRequestId`)
   * 운반/처리장 요청들의 실측 계량 합계를 돌려준다.
   */
  async lookupActualWeighedTons(requestId: string): Promise<number | undefined> {
    const direct = await this.getInner(requestId);
    if (direct?.actualWeighedTons !== undefined && direct.actualWeighedTons > 0) {
      return direct.actualWeighedTons;
    }
    const all = await this.listInner();
    const linked = all.filter(
      (r) =>
        r.linkedRequestId === requestId &&
        r.actualWeighedTons !== undefined &&
        r.actualWeighedTons > 0,
    );
    if (linked.length === 0) return undefined;
    const sum = linked.reduce((acc, r) => acc + (r.actualWeighedTons ?? 0), 0);
    return Math.round(sum * 1000) / 1000;
  }
}
