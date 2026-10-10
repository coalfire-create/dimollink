import type {
  RemoteSurvey,
  RemoteSurveyAnswers,
  RemoteSurveyItemId,
  RemoteSurveyRoom,
  RemoteSurveyShotRequest,
} from '@dimol/shared';
import { api, ApiError } from './http';

/**
 * 원격 실사 촬영 패키지 API — 소비자가 찍어 보내고, 견적에 참여한 업체가 본다.
 *
 * 사진은 [[uploads]] 의 uploadSitePhoto 로 먼저 올리고 여기에는 key 만 넘긴다.
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

/** 요청의 패키지. 아직 안 만들었으면(또는 업체에게 아직 안 보냈으면) null. */
export async function getRemoteSurvey(requestId: string): Promise<RemoteSurvey | null> {
  try {
    return await api<RemoteSurvey>(`/remote-surveys?requestId=${encodeURIComponent(requestId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** 만들기 — 이미 있으면 그것을 돌려준다(두 번 눌러도 하나). */
export const createRemoteSurvey = (requestId: string) =>
  api<RemoteSurvey>('/remote-surveys', { method: 'POST', body: JSON.stringify({ requestId }) });

/** 고치기(작성 중에만). 준 필드만 통째로 바뀐다 — 방 목록은 전체를 보낸다. */
export const updateRemoteSurvey = (
  surveyId: string,
  patch: {
    rooms?: (Omit<RemoteSurveyRoom, 'id'> & { id?: string })[];
    items?: Partial<Record<RemoteSurveyItemId, string[]>>;
    answers?: RemoteSurveyAnswers;
    scanJobId?: string | null;
  },
) =>
  api<RemoteSurvey>(`/remote-surveys/${surveyId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

/** 업체에게 보내기 — 필수가 다 찼을 때만 된다. */
export const submitRemoteSurvey = (surveyId: string) =>
  api<RemoteSurvey>(`/remote-surveys/${surveyId}/submit`, { method: 'POST', body: '{}' });

/** 추가 촬영 요청 목록 — 소비자는 전부, 업체는 자기가 보낸 것만 받는다. */
export const listShotRequests = (surveyId: string) =>
  api<RemoteSurveyShotRequest[]>(`/remote-surveys/${surveyId}/shot-requests`);

/** 업체: "이것 더 찍어 주세요". itemId 가 없으면 문구만으로 요청한다. */
export const createShotRequest = (
  surveyId: string,
  input: { itemId?: RemoteSurveyItemId; message: string },
) =>
  api<RemoteSurveyShotRequest>(`/remote-surveys/${surveyId}/shot-requests`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** 소비자: 찍어서 보내기. */
export const fulfilShotRequest = (shotRequestId: string, photoKeys: string[]) =>
  api<RemoteSurveyShotRequest>(`/remote-surveys/shot-requests/${shotRequestId}/fulfil`, {
    method: 'POST',
    body: JSON.stringify({ photoKeys }),
  });
