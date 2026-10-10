import { useCallback, useEffect, useState } from 'react';
import type { DemolitionRequest, RemoteSurvey } from '@dimol/shared';
import { ApiError, getRemoteSurvey, getRequest } from '../../api/client';

/**
 * 가상 현장 탭들의 공통 재료 — 요청(대장·신청 내용)과 원격 실사 패키지.
 *
 * 각 탭이 **자기가 필요할 때** 이 훅을 부른다(껍데기가 미리 불러 나눠 주지 않는다).
 * 패키지는 소비자가 보내기 전이면 서버가 404 를 주고 null 이 된다 — 오류가 아니라 "아직"이다.
 */
export function useReviewSource(requestId: string) {
  const [request, setRequest] = useState<DemolitionRequest | null>(null);
  const [survey, setSurvey] = useState<RemoteSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [req, pkg] = await Promise.all([getRequest(requestId), getRemoteSurvey(requestId)]);
      setRequest(req.kind === 'DEMOLITION' ? req : null);
      if (req.kind !== 'DEMOLITION') setError('철거 요청을 찾을 수 없습니다.');
      setSurvey(pkg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '현장 자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { request, survey, loading, error, reload: load };
}
