import type { MatchStatus } from './types.js';

/**
 * 매칭 단계별 알림 (로드맵 Phase 4 · 운영 도구).
 * 요청 상태 전이 시 배출자/업체에게 발송되는 인앱 알림 레코드.
 * 실제 발송 채널(푸시/문자)은 서버의 NotificationProvider 어댑터가 담당한다.
 */

/**
 * 알림 종류. **어떤 채널로 내보낼지를 이 값이 정한다.**
 *
 * 문자는 건당 비용이 들고, 잘못 보내면 사용자가 수신거부를 눌러 정작 중요한
 * 알림까지 못 받게 된다. 그래서 채널 판단을 문구 파싱 같은 추측에 맡기지 않고
 * 만드는 쪽이 명시한다.
 * - STATUS: 매칭·결제·작업·정산 단계 전이. 놓치면 거래가 멈춘다 → 문자 발송.
 * - CALL: 운반업체 신규 콜. 놓치면 매칭이 안 된다 → 문자 발송.
 * - CHAT: 대화 메시지. 자주 오고 앱에서 바로 보인다 → 인앱만.
 * - ESTIMATE: 철거 견적 진행(개산 도착·실사 예약·확정 도착). 다음 행동을 해야 흐름이
 *   이어지는데 앱을 안 열면 멈춘다 → 문자 발송.
 */
export type NotificationKind = 'STATUS' | 'CALL' | 'CHAT' | 'ESTIMATE';

export interface AppNotification {
  id: string;
  /** 수신자 (배출자 또는 매칭 업체). */
  userId: string;
  requestId: string;
  /** 알림을 발생시킨 요청 상태. */
  status: MatchStatus;
  /** UI에 그대로 노출 가능한 한글 메시지. */
  message: string;
  /** 알림 종류. 없으면 STATUS 로 본다(이 필드가 생기기 전 기록과의 호환). */
  kind?: NotificationKind;
  createdAt: string;
}

/** 이 알림을 문자로도 보내야 하는가. 채널 판단의 단일 원천. */
export function shouldSendSms(notification: Pick<AppNotification, 'kind'>): boolean {
  return (notification.kind ?? 'STATUS') !== 'CHAT';
}
