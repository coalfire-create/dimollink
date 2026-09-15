import type { ProviderJobs } from '@dimol/shared';
import { listJobs } from '../../api/client';
import { useQuery } from '../../lib/query';

/**
 * 업체 일감 피드 — 아직 안 잡힌 일감(open)과 수주한 일감(assigned).
 *
 * 수락·견적 제출 뒤에는 목록이 달라져야 하므로 refetch 를 함께 돌려준다.
 * 일감은 자주 바뀌는 데이터라 캐시 신선도를 짧게 잡는다.
 */
export function useProviderJobs(userId: string) {
  const { data, isFetching, refetch } = useQuery<ProviderJobs>(
    `jobs:${userId}`,
    () => listJobs(userId),
    { staleTime: 10_000 },
  );
  return {
    jobs: data ?? null,
    open: data?.open ?? [],
    assigned: data?.assigned ?? [],
    isFetching,
    refetch,
  };
}
