import { useCallback, useEffect, useState } from 'react';
import {
  canOpenMoreShotRequests,
  type RemoteSurvey,
  type RemoteSurveyItemId,
  type RemoteSurveyShotRequest,
} from '@dimol/shared';
import { ApiError, createShotRequest, getRemoteSurvey, listShotRequests } from '../../api/client';
import { useSession } from '../../navigation';

/**
 * 사진 탭의 데이터 — 원격 실사 패키지 + 내가 보낸 추가 촬영 요청.
 *
 * 추가 촬영 요청은 밀봉이라 서버가 내 것만 준다. 동시에 열어 둘 수 있는 수(3건)는
 * 서버와 같은 함수([[remote-survey]] canOpenMoreShotRequests)로 미리 막는다 —
 * 눌러 보고 나서야 거절당하지 않게.
 */
export function usePhotoReview(requestId: string) {
  const user = useSession();
  const [survey, setSurvey] = useState<RemoteSurvey | null>(null);
  const [requests, setRequests] = useState<RemoteSurveyShotRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<RemoteSurveyItemId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const pkg = await getRemoteSurvey(requestId);
      setSurvey(pkg);
      setRequests(pkg ? await listShotRequests(pkg.id) : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '사진을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 성공하면 true — 화면이 입력칸을 닫는다. */
  async function requestShot(itemId: RemoteSurveyItemId, message: string): Promise<boolean> {
    if (!survey || busyItem) return false;
    setBusyItem(itemId);
    setError(null);
    try {
      await createShotRequest(survey.id, { itemId, message });
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '추가 촬영 요청에 실패했습니다.');
      return false;
    } finally {
      setBusyItem(null);
    }
  }

  return {
    survey,
    requests,
    loading,
    error,
    busyItem,
    openCount: requests.filter((r) => r.status === 'OPEN').length,
    canRequestMore: canOpenMoreShotRequests(requests, user.id),
    requestShot,
    reload: load,
  };
}
