import { useCallback, useEffect, useState } from 'react';
import type { InteriorBid, InteriorRequest } from '@dimol/shared';
import {
  ApiError,
  acceptInteriorBid,
  getInteriorRequest,
  listInteriorBids,
  submitInteriorBid,
} from '../../api/client';
import { useSession } from '../../navigation';

/**
 * 인테리어 요청 상세의 데이터 — 요청, 입찰 목록, 낙찰·견적 제출.
 *
 * **밀봉 규칙은 서버가 강제한다.** listInteriorBids 는 인증된 viewer 기준으로 필터된
 * 입찰만 돌려준다 — 업체에게는 자기 입찰만 온다. 앱에서 숨기는 방식이었다면 응답만
 * 들여다봐도 경쟁가가 드러났을 것이다.
 */
export function useInteriorDetail(requestId: string) {
  const user = useSession();
  const [request, setRequest] = useState<InteriorRequest | null>(null);
  const [bids, setBids] = useState<InteriorBid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequest(await getInteriorRequest(requestId));
      setBids(await listInteriorBids(requestId).catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(bidId: string) {
    setError(null);
    setAcceptingId(bidId);
    try {
      await acceptInteriorBid(bidId);
      await load(); // 요청이 MATCHED 로 바뀌고 낙찰 결과가 표시된다.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '낙찰에 실패했습니다.');
    } finally {
      setAcceptingId(null);
    }
  }

  /** 견적 제출·수정. 같은 업체가 다시 내면 최신 금액으로 대체된다. */
  async function submitBid(amount: string, memo: string): Promise<boolean> {
    setError(null);
    const value = Number(amount.replace(/\D/g, ''));
    if (!Number.isInteger(value) || value <= 0) {
      setError('견적 금액(원)을 정확히 입력해 주세요.');
      return false;
    }
    setSubmitting(true);
    try {
      await submitInteriorBid(requestId, value, memo.trim() || undefined);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적 제출에 실패했습니다.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // 항상 최저가순 — 도착 순서로 두면 먼저 낸 업체가 유리해진다.
  const sortedBids = [...bids].sort((a, b) => a.amount - b.amount);

  return {
    request,
    bids: sortedBids,
    myBid: sortedBids.find((bid) => bid.providerId === user.id) ?? null,
    isRequester: request ? user.id === request.requesterId : false,
    isOpen: request?.status === 'REQUESTED',
    error,
    acceptingId,
    submitting,
    accept,
    submitBid,
  };
}

export type InteriorDetailState = ReturnType<typeof useInteriorDetail>;
