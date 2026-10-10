import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { isVideoSurveyOpen, VIDEO_SURVEY_COPY, type VideoSurveySession } from '@dimol/shared';
import {
  ApiError,
  acceptVideoSurvey,
  cancelVideoSurvey,
  endVideoSurvey,
  joinVideoSurvey,
  listDemolitionEstimates,
  listVideoSurveys,
  requestVideoSurvey,
} from '../../api/client';

/**
 * 영상통화 실사 카드의 데이터와 동작.
 *
 * 입장 버튼은 시간이 흐르면 켜져야 하므로 30초마다 시계를 갱신한다(서버 왕복 없이).
 * 목록은 동작 뒤에만 다시 불러온다 — 상대 쪽 변화는 알림으로 온다.
 */

const TICK_MS = 30_000;

export function useVideoSurvey(requestId: string, isRequester: boolean) {
  const [sessions, setSessions] = useState<VideoSurveySession[]>([]);
  const [testMode, setTestMode] = useState(false);
  /** 업체: 이 요청에 견적을 냈고 떨어지지 않았는가(통화를 걸 수 있는가). */
  const [canPropose, setCanPropose] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const list = await listVideoSurveys(requestId);
      setSessions(list.sessions);
      setTestMode(list.testMode);
      if (!isRequester) {
        // 밀봉 규칙상 업체는 자기 견적만 받는다.
        const mine = await listDemolitionEstimates(requestId);
        setCanPropose(mine.some((e) => e.stage !== 'DECLINED'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '영상통화 정보를 불러오지 못했습니다.');
    }
  }, [requestId, isRequester]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  async function run(id: string, fn: () => Promise<unknown>, fallback: string): Promise<void> {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  return {
    sessions,
    testMode,
    now,
    busyId,
    error,
    info,
    /** 이미 열린 통화가 있으면 새로 요청하지 않는다(서버도 막는다). */
    canPropose: canPropose && !sessions.some((s) => isVideoSurveyOpen(s.status)),
    propose: (times: string[]) =>
      run('new', () => requestVideoSurvey(requestId, times), '영상통화 요청에 실패했습니다.'),
    accept: (id: string, at: string) =>
      run(id, () => acceptVideoSurvey(id, at), '시간 선택에 실패했습니다.'),
    join: (id: string) =>
      run(
        id,
        async () => {
          const joined = await joinVideoSurvey(id);
          // 테스트 모드 링크는 아무 데도 연결되지 않는다 — 열지 않고 사실대로 알린다.
          if (joined.testMode) {
            setInfo(VIDEO_SURVEY_COPY.testMode);
            return;
          }
          await Linking.openURL(joined.url);
        },
        '영상통화에 들어가지 못했습니다.',
      ),
    end: (id: string) => run(id, () => endVideoSurvey(id), '통화 종료에 실패했습니다.'),
    cancel: (id: string) => run(id, () => cancelVideoSurvey(id), '취소에 실패했습니다.'),
    setError,
  };
}
