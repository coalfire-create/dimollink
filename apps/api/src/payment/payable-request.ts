import type { MatchStatus } from '@dimol/shared';
import type { RequestStore } from '../requests/store.js';
import type { InteriorStore } from '../interior/store.js';

/**
 * 결제/정산이 요청에서 필요로 하는 최소 형태 + 조회·전이 창구.
 *
 * 폐기물 요청(RequestStore)과 인테리어 요청(InteriorStore)은 저장소가 다르지만
 * 선결제·정산·취소 로직은 동일하다(합의 금액 = agreedFee → 선결제 → D+1 정산).
 * 결제 라우터가 스토어 종류를 몰라도 되도록 여기서 한 창구로 합친다.
 *
 * ⚠️ 결제/정산은 CLAUDE.md 「사람이 반드시 직접 diff를 검토」 영역이다.
 */
export interface PayableRequest {
  requesterId: string;
  status: MatchStatus;
  /** 선결제/정산 금액 권위. 클라이언트 입력이 아닌 이 값으로만 청구·지급한다. */
  agreedFee?: number;
  /** 매칭 확정된 셀러 id (정산 지급 대상). */
  matchedProviderId?: string;
}

/** 결제 흐름에서 요청에 기록하는 상태 부가정보. */
export interface PayableStatusPatch {
  paymentId?: string;
  cancelReason?: string;
}

export interface PayableRequestStore {
  get(id: string): Promise<PayableRequest | undefined>;
  changeStatus(id: string, to: MatchStatus, options?: PayableStatusPatch): Promise<void>;
}

/**
 * 여러 요청 스토어를 합쳐 id 소유 스토어로 위임한다.
 * get 이 값을 주는 첫 스토어를 소유자로 보고, 상태 전이도 같은 스토어에 위임한다.
 * 두 스토어의 id 는 randomUUID 라 충돌하지 않는다.
 */
export function compositePayableStore(
  waste: RequestStore,
  interior: InteriorStore,
): PayableRequestStore {
  return {
    async get(id) {
      return (await waste.get(id)) ?? (await interior.getRequest(id));
    },
    async changeStatus(id, to, options = {}) {
      if (await waste.get(id)) {
        await waste.changeStatus(id, to, options);
        return;
      }
      if (await interior.getRequest(id)) {
        await interior.changeRequestStatus(id, to, options);
      }
      // 소유 스토어가 없으면 무시 — 호출부가 이미 존재를 확인한 뒤 호출한다.
    },
  };
}
