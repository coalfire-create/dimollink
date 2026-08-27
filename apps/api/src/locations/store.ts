import { isValidGeoPoint, type GeoPoint, type LocationShare } from '@dimol/shared';
import type { RequestStore } from '../requests/store.js';

/**
 * 실시간 위치 공유 저장소 (로드맵 Phase 4).
 *
 * - 작업 진행중(IN_PROGRESS)인 요청만, 매칭 확정된 업체만 위치를 올릴 수 있다.
 * - 요청당 최신 위치 1건만 유지한다. 이동 경로 이력은 남기지 않는다(위치 PII 최소화).
 * - 의도적으로 영속화하지 않는다 — 서버 재시작 시 사라져도 다음 업데이트로 복구된다.
 */

export class LocationValidationError extends Error {}

export class LocationStore {
  private readonly latest = new Map<string, LocationShare>();

  constructor(private readonly requestStore: RequestStore) {}

  async updateLocation(requestId: string, providerId: string, location: GeoPoint): Promise<LocationShare> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new LocationValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'IN_PROGRESS') {
      throw new LocationValidationError('작업 진행중(IN_PROGRESS)인 요청만 위치를 공유할 수 있습니다.');
    }
    if (!providerId || providerId !== request.matchedProviderId) {
      throw new LocationValidationError('매칭 확정된 업체만 위치를 공유할 수 있습니다.');
    }
    if (!isValidGeoPoint(location)) {
      throw new LocationValidationError('유효한 좌표(lat -90~90, lng -180~180)가 필요합니다.');
    }

    const share: LocationShare = {
      requestId,
      providerId,
      location,
      updatedAt: new Date().toISOString(),
    };
    this.latest.set(requestId, share);
    return share;
  }

  /** 최신 위치. 작업이 진행중이 아니면 공유 종료로 간주하고 null. */
  async getLocation(requestId: string): Promise<LocationShare | null> {
    const request = await this.requestStore.get(requestId);
    if (!request) throw new LocationValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'IN_PROGRESS') {
      this.latest.delete(requestId);
      return null;
    }
    return this.latest.get(requestId) ?? null;
  }
}
