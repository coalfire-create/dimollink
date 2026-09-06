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
      ...(to === 'MATCHED' && typeof options.agreedFee === 'number'
        ? { agreedFee: options.agreedFee }
        : {}),
      ...(to === 'PAID' && options.paymentId ? { paymentId: options.paymentId } : {}),
      ...(to === 'CANCELLED' && options.cancelReason ? { cancelReason: options.cancelReason } : {}),
    };
    
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
}
