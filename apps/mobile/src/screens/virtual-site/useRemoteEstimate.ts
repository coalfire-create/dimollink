import { useCallback, useEffect, useState } from 'react';
import {
  planRemoteSiteVisit,
  siteVisitMode,
  type DemolitionEstimate,
  type DemolitionRequest,
  type RemoteSurvey,
} from '@dimol/shared';
import {
  ApiError,
  getRemoteSurvey,
  getRequest,
  listDemolitionEstimates,
  markRemoteSiteVisit,
  submitFinalEstimate,
} from '../../api/client';

/**
 * 확정 견적 탭의 데이터와 동작 — 내 견적, 원격 실사 자료, 요청(연면적·톤 환산용).
 *
 * "원격 실사로 진행"을 띄울지는 서버와 같은 판정([[remote-site-visit]] planRemoteSiteVisit)으로
 * 정한다. 다만 밀봉 때문에 남의 실사 예약은 안 보여서 상한(3곳)은 서버만 안다 — 넘으면 서버가
 * 거절하고 그 문구를 그대로 띄운다.
 */
export function useRemoteEstimate(requestId: string) {
  const [mine, setMine] = useState<DemolitionEstimate | null>(null);
  const [survey, setSurvey] = useState<RemoteSurvey | null>(null);
  const [request, setRequest] = useState<DemolitionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, pkg, req] = await Promise.all([
        listDemolitionEstimates(requestId),
        getRemoteSurvey(requestId),
        getRequest(requestId),
      ]);
      setMine(rows[0] ?? null);
      setSurvey(pkg);
      setRequest(req.kind === 'DEMOLITION' ? req : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const plan =
    mine && survey ? planRemoteSiteVisit(mine, survey, [mine], new Date().toISOString()) : null;
  const isRemote = siteVisitMode(mine?.visit) === 'REMOTE' && Boolean(mine?.visit);

  return {
    mine,
    survey,
    request,
    loading,
    busy,
    error,
    reload: load,
    isRemote,
    /** 원격 실사로 바꿀(또는 새로 잡을) 수 있고, 아직 같은 내용이 기록돼 있지 않다. */
    canMarkRemote: Boolean(plan?.ok && plan.changed),
    /** 소비자가 잡은 방문 실사를 원격으로 바꾸게 되는가 — 버튼 문구·경고가 달라진다. */
    convertsInPerson: Boolean(plan?.ok && plan.convertedFromInPerson),
    markRemote: () => {
      if (!mine) return;
      void run(() => markRemoteSiteVisit(mine.id), '원격 실사로 바꾸지 못했습니다.');
    },
    /**
     * 확정 견적. 실사가 원격이고 자료가 있으면 원격 기준으로 낸다(서버가 패키지 id 까지 맞춘다).
     * 방문 실사였다면 예전 그대로 낸다 — 이 화면에서 냈다는 이유로 방식을 바꾸지 않는다.
     */
    submitFinal: (input: { amount: number; overrunReason?: string }) => {
      if (!mine) return;
      const remote = isRemote && survey?.status === 'SUBMITTED';
      void run(
        () => submitFinalEstimate({ estimateId: mine.id, ...input, remote }),
        '확정 견적 제출에 실패했습니다.',
      );
    },
  };
}
