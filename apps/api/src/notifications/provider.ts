import type { AppNotification } from '@dimol/shared';

/**
 * 알림 발송 어댑터 (로드맵 Phase 4).
 * 푸시/문자 계약 전이므로 콘솔 목으로 시작한다 — 실연동 시 이 인터페이스 구현체만
 * 교체한다 (FCM 푸시, 알림톡/SMS 등). 발송 실패가 매칭 플로우를 막으면 안 된다.
 */
export interface NotificationProvider {
  send(notification: AppNotification): void;
}

/** 콘솔 목 — 개발/파일럿용. 전화번호 등 PII 는 출력하지 않는다 (userId 는 내부 id). */
export class ConsoleNotificationProvider implements NotificationProvider {
  send(notification: AppNotification): void {
    console.log(
      `[notify] → ${notification.userId}: ${notification.message} (request=${notification.requestId}, status=${notification.status})`,
    );
  }
}
