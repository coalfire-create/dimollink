import { describe, expect, it } from 'vitest';
import {
  VIDEO_SURVEY_COPY,
  VIDEO_SURVEY_JOIN_EARLY_MIN,
  VIDEO_SURVEY_MAX_DURATION_MIN,
  VIDEO_SURVEY_MAX_PROPOSALS,
  VIDEO_SURVEY_RECORDING_ENABLED,
  canJoinVideoSurvey,
  canTransitionVideoSurvey,
  isVideoSurveyOpen,
  isVideoSurveyParty,
  validateProposedTimes,
  videoSurveyDurationSec,
  videoSurveyJoinWindow,
  type VideoSurveyStatus,
} from '@dimol/shared';

/**
 * 영상통화 실사 규칙 — 화면(버튼)과 서버(링크 발급)가 같은 판정을 쓰므로 경계를 못 박는다.
 */

const AT = '2026-10-20T05:00:00.000Z';
const min = (n: number) => n * 60_000;

describe('상태 전이', () => {
  const allowed: Array<[VideoSurveyStatus, VideoSurveyStatus]> = [
    ['REQUESTED', 'SCHEDULED'],
    ['REQUESTED', 'CANCELLED'],
    ['SCHEDULED', 'LIVE'],
    ['SCHEDULED', 'CANCELLED'],
    ['LIVE', 'ENDED'],
  ];
  it.each(allowed)('%s → %s 허용', (from, to) => {
    expect(canTransitionVideoSurvey(from, to)).toBe(true);
  });

  const denied: Array<[VideoSurveyStatus, VideoSurveyStatus]> = [
    ['REQUESTED', 'LIVE'], // 시간을 고르기 전에 통화하지 않는다
    ['REQUESTED', 'ENDED'],
    ['SCHEDULED', 'ENDED'], // 들어온 적 없는 통화를 "끝냈다"고 기록하지 않는다
    ['LIVE', 'CANCELLED'], // 통화 중 취소 없음 — 종료로 남겨야 통화 시간이 기록된다
    ['ENDED', 'LIVE'],
    ['CANCELLED', 'SCHEDULED'],
  ];
  it.each(denied)('%s → %s 거부', (from, to) => {
    expect(canTransitionVideoSurvey(from, to)).toBe(false);
  });

  it('끝나거나 취소된 세션은 열린 세션이 아니다', () => {
    expect(isVideoSurveyOpen('REQUESTED')).toBe(true);
    expect(isVideoSurveyOpen('LIVE')).toBe(true);
    expect(isVideoSurveyOpen('ENDED')).toBe(false);
    expect(isVideoSurveyOpen('CANCELLED')).toBe(false);
  });
});

describe('입장 가능 시간', () => {
  const session = { status: 'SCHEDULED' as const, scheduledAt: AT };
  const at = Date.parse(AT);

  it('약속 N분 전부터 최대 통화 시간 뒤까지', () => {
    const w = videoSurveyJoinWindow(AT);
    expect(Date.parse(w.opensAt)).toBe(at - min(VIDEO_SURVEY_JOIN_EARLY_MIN));
    expect(Date.parse(w.closesAt)).toBe(at + min(VIDEO_SURVEY_MAX_DURATION_MIN));
  });

  it('열리기 직전은 거부, 열리는 순간은 허용', () => {
    const opens = at - min(VIDEO_SURVEY_JOIN_EARLY_MIN);
    expect(canJoinVideoSurvey(session, new Date(opens - 1))).toBe(false);
    expect(canJoinVideoSurvey(session, new Date(opens))).toBe(true);
  });

  it('닫히는 순간부터 거부', () => {
    const closes = at + min(VIDEO_SURVEY_MAX_DURATION_MIN);
    expect(canJoinVideoSurvey(session, new Date(closes - 1))).toBe(true);
    expect(canJoinVideoSurvey(session, new Date(closes))).toBe(false);
  });

  it('통화 중(LIVE)이면 다시 들어올 수 있다 — 끊겼다 재접속', () => {
    expect(canJoinVideoSurvey({ status: 'LIVE', scheduledAt: AT }, new Date(at))).toBe(true);
  });

  it('예약 전·종료·취소면 시간이 맞아도 거부', () => {
    for (const status of ['REQUESTED', 'ENDED', 'CANCELLED'] as const) {
      expect(canJoinVideoSurvey({ status, scheduledAt: AT }, new Date(at))).toBe(false);
    }
    expect(canJoinVideoSurvey({ status: 'SCHEDULED' }, new Date(at))).toBe(false);
  });
});

describe('통화 시간', () => {
  it('초 단위로 기록', () => {
    expect(videoSurveyDurationSec(AT, new Date(Date.parse(AT) + 90_500).toISOString())).toBe(91);
  });
  it('상한을 넘겨 기록하지 않는다 — 방이 그때 만료된다', () => {
    const later = new Date(Date.parse(AT) + min(VIDEO_SURVEY_MAX_DURATION_MIN + 15)).toISOString();
    expect(videoSurveyDurationSec(AT, later)).toBe(VIDEO_SURVEY_MAX_DURATION_MIN * 60);
  });
  it('음수는 0', () => {
    expect(videoSurveyDurationSec(AT, '2026-10-20T04:00:00.000Z')).toBe(0);
  });
});

describe('제안 시간 검증', () => {
  const now = new Date('2026-10-10T00:00:00.000Z');

  it('정상 — 정렬해서 돌려준다', () => {
    const r = validateProposedTimes(['2026-10-12T05:00:00Z', '2026-10-11T05:00:00Z'], now);
    expect(r).toEqual({
      ok: true,
      times: ['2026-10-11T05:00:00.000Z', '2026-10-12T05:00:00.000Z'],
    });
  });

  it('비었거나 배열이 아니면 거부', () => {
    expect(validateProposedTimes([], now).ok).toBe(false);
    expect(validateProposedTimes('2026-10-11T05:00:00Z', now).ok).toBe(false);
  });

  it('상한 초과 거부', () => {
    const times = Array.from({ length: VIDEO_SURVEY_MAX_PROPOSALS + 1 }, (_, i) =>
      new Date(now.getTime() + min(60 * (i + 1))).toISOString(),
    );
    expect(validateProposedTimes(times, now).ok).toBe(false);
  });

  it('지난 시간·너무 먼 시간·중복·잘못된 값 거부', () => {
    expect(validateProposedTimes(['2026-10-09T05:00:00Z'], now).ok).toBe(false);
    expect(validateProposedTimes(['2026-11-30T05:00:00Z'], now).ok).toBe(false);
    expect(
      validateProposedTimes(['2026-10-11T05:00:00Z', '2026-10-11T14:00:00+09:00'], now).ok,
    ).toBe(false);
    expect(validateProposedTimes(['내일 오후'], now).ok).toBe(false);
  });
});

describe('개인정보', () => {
  it('녹화하지 않는다 — 정책값과 화면 안내 문구가 함께 있어야 한다', () => {
    expect(VIDEO_SURVEY_RECORDING_ENABLED).toBe(false);
    expect(VIDEO_SURVEY_COPY.noRecording).toContain('녹화되지 않아요');
  });

  it('당사자 판정', () => {
    const s = { providerId: 'p', requesterId: 'r' };
    expect(isVideoSurveyParty(s, 'p')).toBe(true);
    expect(isVideoSurveyParty(s, 'r')).toBe(true);
    expect(isVideoSurveyParty(s, 'x')).toBe(false);
  });
});
