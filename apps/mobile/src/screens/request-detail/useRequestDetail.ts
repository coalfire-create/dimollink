import { useCallback, useEffect, useState } from 'react';
import type { Quote, ServiceRequest } from '@dimol/shared';
import {
  ApiError,
  acceptQuote,
  cancelPayment,
  cancelRequest,
  getRequest,
  getSitePhotoViewUrl,
  listQuotes,
  updateRequestStatus,
} from '../../api/client';
import { requestsKey } from '../../api/queryKeys';
import { useToast } from '../../components/Toast';
import { invalidateQueries, setQueryData, useQuery } from '../../lib/query';
import { useSession } from '../../navigation';

/**
 * 요청 상세의 데이터와 상태 변경 — 화면에서 떼어낸 부분.
 *
 * 이 화면은 보기만 하는 곳이 아니라 **돈과 상태가 실제로 움직이는** 곳이다
 * (견적 수락 → 결제 → 작업 진행 → 완료, 그리고 취소·환불).
 * 그 전이를 전부 한 곳에 모아 두면, 어떤 동작이 어떤 상태를 만드는지 한 눈에 읽힌다.
 *
 * 공통 규칙 두 가지:
 *  - 서버가 돌려준 최신 요청은 캐시에 바로 써 넣는다(재조회 없이 화면이 바뀐다).
 *  - 목록 캐시는 무효화만 해 둔다(대시보드로 돌아가면 갱신된 상태로 보인다).
 */
export function useRequestDetail(requestId: string) {
  const user = useSession();
  const toast = useToast();

  const [error, setError] = useState<string | null>(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const detailKey = requestsKey.detail(requestId);
  const {
    data: request,
    error: loadError,
    isLoading,
    refetch,
  } = useQuery<ServiceRequest>(detailKey, () => getRequest(requestId));

  const applyUpdated = useCallback(
    (next: ServiceRequest) => {
      setQueryData(detailKey, next);
      invalidateQueries('requests:list');
    },
    [detailKey],
  );

  const reload = useCallback(async () => {
    invalidateQueries(`requests:quotes:${requestId}`);
    await refetch();
  }, [refetch, requestId]);

  // 견적은 "내 요청이고 아직 매칭 대기중"일 때만 의미가 있다 — 그 외에는 아예 부르지 않는다.
  const shouldLoadQuotes =
    request !== undefined && request.requesterId === user.id && request.status === 'REQUESTED';
  const { data: quotesData } = useQuery<Quote[]>(
    shouldLoadQuotes ? requestsKey.quotes(requestId) : null,
    () => listQuotes(requestId).catch(() => []),
  );
  const quotes: Quote[] = shouldLoadQuotes ? (quotesData ?? []) : [];

  // 현장 사진은 키만 저장돼 있어 볼 때마다 서명 URL 을 받아야 한다.
  useEffect(() => {
    const keys = request?.sitePhotoKeys;
    if (!keys || keys.length === 0) {
      setPhotoUrls([]);
      return;
    }
    let active = true;
    void (async () => {
      const urls = await Promise.all(
        keys.map(async (key) => {
          try {
            return (await getSitePhotoViewUrl(key)).viewUrl;
          } catch {
            return '';
          }
        }),
      );
      if (active) setPhotoUrls(urls.filter((url) => url !== ''));
    })();
    return () => {
      active = false;
    };
  }, [request?.sitePhotoKeys]);

  /** 실패 문구는 서버가 준 한글 메시지를 그대로 쓴다(사용자에게 노출 가능한 문구다). */
  function failWith(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function acceptQuoteAndMatch(quoteId: string) {
    setError(null);
    setAcceptingQuoteId(quoteId);
    try {
      await acceptQuote(quoteId);
      await reload(); // 요청이 MATCHED 로 바뀌고 견적 섹션은 사라진다.
      toast.success('견적을 수락했어요.', '결제하면 작업 일정이 확정돼요.');
    } catch (err) {
      failWith(err, '견적 수락에 실패했습니다.');
    } finally {
      setAcceptingQuoteId(null);
    }
  }

  /** 업체(매칭 확정 업체)가 작업 상태를 진행한다. */
  async function advance(status: 'IN_PROGRESS' | 'COMPLETED') {
    setError(null);
    setAdvancing(true);
    try {
      applyUpdated(await updateRequestStatus(requestId, status));
      toast.success(status === 'IN_PROGRESS' ? '작업을 시작했어요.' : '작업 완료로 표시했어요.');
    } catch (err) {
      failWith(err, '상태 변경에 실패했습니다.');
    } finally {
      setAdvancing(false);
    }
  }

  async function confirmRefund() {
    if (!request?.paymentId) return;
    setError(null);
    setRefunding(true);
    try {
      // 결제완료(배차 전) 취소 = 전액 환불. 서버가 결제자·금액을 검증한다.
      await cancelPayment({ paymentId: request.paymentId, stage: 'BEFORE_DISPATCH' });
      toast.success('환불 요청이 접수됐어요.');
      await reload(); // 요청이 CANCELLED 로 전이된다.
    } catch (err) {
      failWith(err, '환불 처리에 실패했습니다.');
    } finally {
      setRefunding(false);
    }
  }

  async function confirmCancel(reason: string) {
    setError(null);
    setCancelling(true);
    try {
      applyUpdated(await cancelRequest(requestId, reason.trim() || '사용자 취소'));
      toast.success('요청을 취소했어요.');
    } catch (err) {
      failWith(err, '취소에 실패했습니다.');
    } finally {
      setCancelling(false);
    }
  }

  return {
    request,
    quotes,
    photoUrls,
    isLoading,
    /** 화면에 띄울 오류 — 동작 실패가 우선, 없으면 조회 실패. */
    errorMessage: error ?? (loadError ? loadError.message : null),
    reload,
    refetch,
    acceptQuoteAndMatch,
    acceptingQuoteId,
    advance,
    advancing,
    confirmRefund,
    refunding,
    confirmCancel,
    cancelling,
  };
}

export type RequestDetailState = ReturnType<typeof useRequestDetail>;
