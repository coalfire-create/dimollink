import { randomUUID } from 'node:crypto';
import {
  PILOT,
  SITE_PHOTOS_MAX_PER_REQUEST,
  isValidSitePhotoKey,
  type MatchRequest,
  type WasteCategory,
} from '@dimol/shared';

/**
 * 매칭요청 저장소 (파일럿 단계: 인메모리).
 * 철거요청/처리장예약 UI 에서 올라온 현장 사진 키를 매칭요청 데이터에 연결한다.
 * DB(PostgreSQL) 연동 시 저장 구현만 교체하고 검증 규칙은 그대로 유지한다.
 */

export interface CreateMatchRequestInput {
  dischargerId: string;
  region: string;
  wasteCategory: WasteCategory;
  wasteTons: number;
  allbaroRequested: boolean;
  /** 매칭 신청 전에 업로드해 둔 현장 사진 오브젝트 키 목록. */
  sitePhotoKeys?: string[];
}

export class MatchRequestValidationError extends Error {}

/**
 * 현장 사진 키 목록 검증 + 중복 제거.
 * 서버가 발급한 키 형식만 허용해 외부 URL/임의 경로 주입을 차단한다.
 */
function normalizeSitePhotoKeys(keys: unknown): string[] {
  if (keys === undefined) return [];
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) {
    throw new MatchRequestValidationError('sitePhotoKeys 는 문자열 배열이어야 합니다.');
  }
  const unique = [...new Set(keys as string[])];
  if (unique.length > SITE_PHOTOS_MAX_PER_REQUEST) {
    throw new MatchRequestValidationError(
      `현장 사진은 요청당 최대 ${SITE_PHOTOS_MAX_PER_REQUEST}장까지 첨부할 수 있습니다.`,
    );
  }
  for (const key of unique) {
    if (!isValidSitePhotoKey(key)) {
      throw new MatchRequestValidationError(`유효하지 않은 사진 키입니다: ${key}`);
    }
  }
  return unique;
}

export class MatchRequestStore {
  private readonly requests = new Map<string, MatchRequest>();

  create(input: CreateMatchRequestInput): MatchRequest {
    if (!input.dischargerId || typeof input.dischargerId !== 'string') {
      throw new MatchRequestValidationError('dischargerId 가 필요합니다.');
    }
    // 파일럿 범위 한정 (CLAUDE.md 핵심 비즈니스 규칙): 양평 · 건설폐기물.
    if (input.region !== PILOT.region) {
      throw new MatchRequestValidationError(
        `파일럿 기간에는 ${PILOT.region} 지역만 접수할 수 있습니다.`,
      );
    }
    if (input.wasteCategory !== PILOT.wasteCategory) {
      throw new MatchRequestValidationError('파일럿 기간에는 건설폐기물만 접수할 수 있습니다.');
    }
    if (!Number.isFinite(input.wasteTons) || input.wasteTons <= 0) {
      throw new MatchRequestValidationError('wasteTons(폐기물 중량, 톤)은 양수여야 합니다.');
    }

    const request: MatchRequest = {
      id: randomUUID(),
      dischargerId: input.dischargerId,
      region: input.region,
      wasteCategory: input.wasteCategory,
      wasteTons: input.wasteTons,
      allbaroRequested: Boolean(input.allbaroRequested),
      sitePhotoKeys: normalizeSitePhotoKeys(input.sitePhotoKeys),
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  get(id: string): MatchRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * 기존 매칭요청에 현장 사진 추가 연결 (처리장예약 등 사후 첨부 흐름).
   * 기존 키와 합산해 최대 장수를 넘지 않아야 한다.
   */
  attachSitePhotos(id: string, keys: string[]): MatchRequest {
    const request = this.requests.get(id);
    if (!request) {
      throw new MatchRequestValidationError('매칭요청을 찾을 수 없습니다.');
    }
    const merged = normalizeSitePhotoKeys([...request.sitePhotoKeys, ...keys]);
    const updated: MatchRequest = { ...request, sitePhotoKeys: merged };
    this.requests.set(id, updated);
    return updated;
  }
}
