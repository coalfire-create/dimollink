import type { VideoSurveySession } from '@dimol/shared';
import { api } from './http';

/**
 * 영상통화 실사 API — 업체가 시간 제안 → 요청자가 선택 → 입장 시간에 참여 → 종료.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 * 입장 시간·상태 판정은 shared 의 video-survey 순수 함수로 화면과 서버가 같이 쓴다.
 */

export interface VideoSurveyList {
  sessions: VideoSurveySession[];
  /** 서버가 목 공급자로 돌고 있으면 true — 화면에 '테스트 모드'를 띄운다. */
  testMode: boolean;
}

export interface VideoSurveyJoin {
  url: string;
  testMode: boolean;
  closesAt: string;
  session: VideoSurveySession;
}

/** 요청의 영상통화 목록. 요청자는 전부, 업체는 자기 것만 받는다. */
export const listVideoSurveys = (requestId: string) =>
  api<VideoSurveyList>(`/requests/${encodeURIComponent(requestId)}/video-surveys`);

/** 업체 — 통화를 요청하며 가능한 시간(최대 3개)을 제안한다. */
export const requestVideoSurvey = (requestId: string, proposedAt: string[]) =>
  api<VideoSurveySession>(`/requests/${encodeURIComponent(requestId)}/video-surveys`, {
    method: 'POST',
    body: JSON.stringify({ proposedAt }),
  });

/** 요청자 — 제안된 시간 중 하나를 고른다 → 예약. */
export const acceptVideoSurvey = (sessionId: string, scheduledAt: string) =>
  api<VideoSurveySession>(`/video-surveys/${sessionId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  });

/** 입장 링크 받기 — 매번 새로 받는다(링크는 곧 만료된다). */
export const joinVideoSurvey = (sessionId: string) =>
  api<VideoSurveyJoin>(`/video-surveys/${sessionId}/join`, { method: 'POST', body: '{}' });

export const endVideoSurvey = (sessionId: string) =>
  api<VideoSurveySession>(`/video-surveys/${sessionId}/end`, { method: 'POST', body: '{}' });

export const cancelVideoSurvey = (sessionId: string) =>
  api<VideoSurveySession>(`/video-surveys/${sessionId}/cancel`, { method: 'POST', body: '{}' });
