/**
 * 영상통화 실사 (로드맵 Phase 4 · 커뮤니케이션 강화).
 *
 * 철거 금액은 현장을 봐야 정해진다([[demolition-estimate]]). 그런데 업체가 매번
 * 현장까지 오가면 그 이동 비용이 견적에 얹힌다. 현장에 있는 사람이 휴대폰으로
 * "거기 비춰 주세요"에 답해 주면, 업체는 이동 없이 같은 것을 보고 판단할 수 있다.
 *
 * 흐름: 업체가 통화를 요청하며 가능한 시간을 제안 → 배출자가 하나를 고름(예약) →
 * 약속 시간 앞뒤의 입장 가능 시간에만 두 사람이 들어간다 → 끝내면 통화 시간이 남는다.
 *
 * 상태 전이·입장 시간 판정은 여기 순수 함수로만 둔다 — 화면(버튼 활성화)과 서버
 * (입장 링크 발급)가 같은 판정을 써야 "버튼은 눌리는데 서버가 거절"하는 일이 없다.
 */

export type VideoSurveyStatus = 'REQUESTED' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

export interface VideoSurveySession {
  id: string;
  requestId: string;
  /** 연결된 철거 견적. 있으면 그 견적의 실사가 원격(REMOTE)으로 기록된다. */
  estimateId?: string;
  /** 통화를 요청한 업체. */
  providerId: string;
  providerName?: string;
  /** 현장 쪽(요청자). */
  requesterId: string;
  status: VideoSurveyStatus;
  /** 업체가 제안한 시간들(ISO). 배출자는 이 중 하나만 고를 수 있다. */
  proposedAt?: string[];
  /** 확정된 통화 시간(ISO). */
  scheduledAt?: string;
  /** 처음 누가 입장한 시각. */
  startedAt?: string;
  endedAt?: string;
  /** 통화 시간(초). 상한([[VIDEO_SURVEY_MAX_DURATION_MIN]])을 넘겨 기록하지 않는다. */
  durationSec?: number;
  /** 취소한 사람(상대에게 누가 취소했는지 알려야 다시 잡을 수 있다). */
  cancelledBy?: string;
  createdAt: string;
}

/**
 * 통화 최대 길이(분).
 * 실사에서 볼 것(구조·마감재·석면 의심 부위·반출 동선)은 20~30분이면 충분하고,
 * 영상통화 서비스는 분 단위로 과금된다. 방 자체가 이 시간 뒤 만료돼(강제 종료)
 * 켜 둔 채 잊어도 비용이 무한히 쌓이지 않는다.
 */
export const VIDEO_SURVEY_MAX_DURATION_MIN = 30;

/**
 * 약속 시간보다 몇 분 먼저 입장할 수 있는가.
 * 고령 사용자는 카메라·마이크 권한 허용에 시간이 걸린다. 너무 일찍 열면 한쪽이
 * 오래 기다리다 나가 버리므로 10분으로 둔다.
 */
export const VIDEO_SURVEY_JOIN_EARLY_MIN = 10;

/**
 * 업체가 한 번에 제안할 수 있는 시간 수.
 * 고르기 쉬워야 한다 — 선택지가 많으면 고령 사용자는 오히려 정하지 못한다.
 */
export const VIDEO_SURVEY_MAX_PROPOSALS = 3;

/** 제안 시간은 며칠 안이어야 하는가. 그보다 먼 약속은 견적 자체가 식는다. */
export const VIDEO_SURVEY_MAX_LEAD_DAYS = 14;

/**
 * 녹화하지 않는다(정책 — 바꾸려면 동의 절차·보관 기간·파기 규정이 먼저 있어야 한다).
 * 현장 영상에는 집 내부·가족·주소 같은 개인정보가 그대로 담긴다. 녹화본은 유출되면
 * 되돌릴 수 없고, 견적에 필요한 것은 통화 중에 업체가 본 것으로 충분하다.
 * 서버는 방을 만들 때 녹화 기능을 켜지 않는다(이 값이 false 인 것을 테스트가 확인한다).
 */
export const VIDEO_SURVEY_RECORDING_ENABLED = false as const;

/** 화면 문구 — 고령 사용자 기준으로 짧고 분명하게. */
export const VIDEO_SURVEY_COPY = {
  title: '영상통화 실사',
  intro: '업체가 현장에 오지 않고, 영상통화로 현장을 보고 견적을 냅니다.',
  noRecording: '통화는 녹화되지 않아요. 화면은 통화 중에만 보입니다.',
  testMode: '테스트 모드 — 실제 영상통화가 연결되지 않습니다.',
  requestCall: '영상통화 실사 요청',
  pickTime: '가능한 시간을 골라 주세요',
  join: '영상통화 참여',
  end: '통화 종료',
  cancel: '취소',
  notYet: (opensAt: string) =>
    `${new Date(opensAt).toLocaleString('ko-KR')}부터 참여할 수 있어요.`,
  status: {
    REQUESTED: '시간 선택 대기',
    SCHEDULED: '예약됨',
    LIVE: '통화 중',
    ENDED: '종료',
    CANCELLED: '취소됨',
  } satisfies Record<VideoSurveyStatus, string>,
} as const;

/** 허용된 상태 전이. 끝난(ENDED)·취소된(CANCELLED) 세션은 되살리지 않는다 — 새로 만든다. */
const TRANSITIONS: Record<VideoSurveyStatus, readonly VideoSurveyStatus[]> = {
  REQUESTED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['LIVE', 'CANCELLED'],
  // 통화 중 취소는 없다 — 이미 본 것은 "종료"로 남겨야 통화 시간이 기록된다.
  LIVE: ['ENDED'],
  ENDED: [],
  CANCELLED: [],
};

export function canTransitionVideoSurvey(from: VideoSurveyStatus, to: VideoSurveyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 아직 진행 중인(끝나지도 취소되지도 않은) 세션인가. 업체당 하나만 열어 둔다. */
export function isVideoSurveyOpen(status: VideoSurveyStatus): boolean {
  return status === 'REQUESTED' || status === 'SCHEDULED' || status === 'LIVE';
}

export interface JoinWindow {
  opensAt: string;
  closesAt: string;
}

/** 입장 가능 시간 — 약속 N분 전부터 최대 통화 시간이 지날 때까지. */
export function videoSurveyJoinWindow(scheduledAt: string): JoinWindow {
  const at = Date.parse(scheduledAt);
  return {
    opensAt: new Date(at - VIDEO_SURVEY_JOIN_EARLY_MIN * 60_000).toISOString(),
    closesAt: new Date(at + VIDEO_SURVEY_MAX_DURATION_MIN * 60_000).toISOString(),
  };
}

/**
 * 지금 입장할 수 있는가. 예약(SCHEDULED)·통화 중(LIVE)이고 입장 시간 안이어야 한다.
 * 화면은 이 값으로 버튼을 켜고, 서버는 같은 값으로 링크 발급을 거절한다.
 */
export function canJoinVideoSurvey(
  session: Pick<VideoSurveySession, 'status' | 'scheduledAt'>,
  now: Date,
): boolean {
  if (session.status !== 'SCHEDULED' && session.status !== 'LIVE') return false;
  if (!session.scheduledAt) return false;
  const { opensAt, closesAt } = videoSurveyJoinWindow(session.scheduledAt);
  const t = now.getTime();
  return t >= Date.parse(opensAt) && t < Date.parse(closesAt);
}

/** 통화 시간(초). 방이 상한에서 만료되므로 그 이상은 실제로 통화한 시간이 아니다. */
export function videoSurveyDurationSec(startedAt: string, endedAt: string): number {
  const sec = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
  return Math.min(Math.max(sec, 0), VIDEO_SURVEY_MAX_DURATION_MIN * 60);
}

/**
 * 업체가 제안한 시간 검증 — 1~N개, 미래, 너무 멀지 않음, 중복 없음.
 * 통과하면 정렬된 ISO 문자열을 돌려준다.
 */
export function validateProposedTimes(
  times: unknown,
  now: Date,
): { ok: true; times: string[] } | { ok: false; error: string } {
  if (!Array.isArray(times) || times.length === 0) {
    return { ok: false, error: '가능한 시간을 하나 이상 골라 주세요.' };
  }
  if (times.length > VIDEO_SURVEY_MAX_PROPOSALS) {
    return { ok: false, error: `시간은 최대 ${VIDEO_SURVEY_MAX_PROPOSALS}개까지 제안할 수 있어요.` };
  }
  const limit = now.getTime() + VIDEO_SURVEY_MAX_LEAD_DAYS * 24 * 60 * 60_000;
  const parsed: number[] = [];
  for (const t of times) {
    const ms = typeof t === 'string' ? Date.parse(t) : NaN;
    if (Number.isNaN(ms)) return { ok: false, error: '시간을 정확히 입력해 주세요.' };
    if (ms <= now.getTime()) return { ok: false, error: '지난 시간은 제안할 수 없어요.' };
    if (ms > limit) {
      return { ok: false, error: `${VIDEO_SURVEY_MAX_LEAD_DAYS}일 안의 시간만 제안할 수 있어요.` };
    }
    parsed.push(ms);
  }
  if (new Set(parsed).size !== parsed.length) {
    return { ok: false, error: '같은 시간이 두 번 들어 있어요.' };
  }
  return { ok: true, times: parsed.sort((a, b) => a - b).map((ms) => new Date(ms).toISOString()) };
}

/** 이 사용자가 세션의 당사자인가(업체 또는 현장 쪽). 입장 링크는 둘에게만 나간다. */
export function isVideoSurveyParty(
  session: Pick<VideoSurveySession, 'providerId' | 'requesterId'>,
  userId: string,
): boolean {
  return session.providerId === userId || session.requesterId === userId;
}
