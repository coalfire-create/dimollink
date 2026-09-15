import { useCallback, useEffect, useState } from 'react';
import type { ServiceRequest } from '@dimol/shared';
import { getRatingSummary, listRequests, listUsers } from '../../api/client';
import { hasSeenGuide, setSeenGuide } from '../../lib/session-storage';
import { useSession } from '../../navigation';
import { toPartner, type DemolitionPartner } from './PartnerList';

/**
 * 배출자 홈의 데이터 — 내 요청, 협력 업체, 첫 방문 가이드.
 *
 * 세 가지를 따로 다룬다: 내 요청을 못 불러온 건 **사용자가 알아야 하는 실패**라
 * 배너로 알리고, 업체 목록·평점은 부가 정보라 조용히 비운다. 하나가 실패해도
 * 나머지는 뜬다(Promise.allSettled).
 */
export function useConsumerHome() {
  const user = useSession();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [partners, setPartners] = useState<DemolitionPartner[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // 처음 온 사용자에게만 가이드를 띄운다(한 번 닫으면 다시 뜨지 않는다).
  useEffect(() => {
    let active = true;
    void (async () => {
      const seen = await hasSeenGuide(user.id);
      if (!seen && active) setShowGuide(true);
    })();
    return () => {
      active = false;
    };
  }, [user.id]);

  const load = useCallback(async () => {
    const [reqsRes, usersRes] = await Promise.allSettled([
      listRequests(user.id),
      listUsers({ userType: 'DEMOLITION_COMPANY', approvalStatus: 'APPROVED' }),
    ]);

    if (reqsRes.status === 'fulfilled') setRequests(reqsRes.value);

    if (usersRes.status === 'fulfilled' && usersRes.value) {
      // 평점은 업체별로 따로 불러온다. 하나가 실패해도 목록 자체는 뜨게 한다.
      const ratings = await Promise.all(
        usersRes.value.map((u) => getRatingSummary(u.id).catch(() => null)),
      );
      setPartners(usersRes.value.map((u, index) => toPartner(u, ratings[index])));
      setPartnersLoaded(true);
    }

    // 내 요청을 못 불러온 건 사용자가 알아야 한다(시세·업체 목록은 부가 정보).
    setLoadError(
      reqsRes.status === 'rejected'
        ? '내 요청을 불러오지 못했어요. 연결 상태를 확인해 주세요.'
        : null,
    );
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    requests,
    /** 홈에서는 지금 신경 써야 하는 건만 — 끝났거나 취소된 건 뺀다. */
    activeRequests: requests.filter(
      (r) => r.status !== 'COMPLETED' && r.status !== 'SETTLED' && r.status !== 'CANCELLED',
    ),
    partners,
    partnersLoaded,
    loadError,
    refreshing,
    load,
    refresh: useCallback(async () => {
      setRefreshing(true);
      await load();
      setRefreshing(false);
    }, [load]),
    showGuide,
    closeGuide: () => setShowGuide(false),
    dismissGuideForever: async () => {
      await setSeenGuide(user.id);
      setShowGuide(false);
    },
  };
}
