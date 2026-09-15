import type { MarketRate, ProviderRole } from '@dimol/shared';
import { getMarketRate } from '../../api/client';
import { useQuery } from '../../lib/query';

/**
 * 홈 화면들이 같이 쓰는 시세 조회.
 *
 * 부가 정보라 실패해도 화면은 그대로 뜬다(에러를 밖으로 내보내지 않는다).
 * 캐시를 거치므로 탭을 옮겨 다녀도 같은 숫자를 다시 받아오지 않는다.
 */
export function useMarketRate(party?: ProviderRole): MarketRate | null {
  const { data } = useQuery<MarketRate>(
    party ? `market-rate:${party}` : null,
    () => getMarketRate(party as ProviderRole),
    // 시세는 분 단위로 바뀌지 않는다 — 5분은 캐시를 그대로 쓴다.
    { staleTime: 5 * 60_000 },
  );
  return data ?? null;
}
