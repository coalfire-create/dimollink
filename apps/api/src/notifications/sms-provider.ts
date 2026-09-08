import { shouldSendSms, type AppNotification } from '@dimol/shared';
import type { SmsSender } from '../auth/otp-service.js';

/**
 * 매칭 알림 문자 발송기.
 *
 * 인앱 알림함만으로는 사용자가 앱을 열어야 알 수 있다. 배출자는 자기 현장에 차가
 * 언제 오는지 모르고, 운반업체는 콜을 놓친다 — 매칭 플랫폼에서 이건 기능 결손이다.
 * 로드맵 Phase 4 가 "고령 사용자에게는 문자가 더 유효"라고 짚은 항목이기도 하다.
 *
 * 문자 발송기(Solapi)는 인증코드용으로 이미 있다. 여기서는 그걸 그대로 쓴다 —
 * 발송기를 두 벌로 나누면 발신번호·공급자 설정이 갈라져 한쪽만 운영 전환되는 사고가 난다.
 *
 * 원칙:
 * - **발송 실패가 매칭 흐름을 막지 않는다.** 문자가 안 가도 거래는 진행돼야 한다.
 * - **전화번호를 평문으로 로그에 남기지 않는다**(CLAUDE.md 절대 규칙).
 * - 채팅은 문자로 보내지 않는다 — 대화 한 줄마다 문자가 가면 비용도, 사용자도 못 견딘다.
 */

/** 수신자 전화번호 조회. 없으면 undefined(탈퇴·미등록). */
export type PhoneLookup = (userId: string) => Promise<string | undefined> | string | undefined;

/** 문자 본문 접두사. 수신자가 어디서 온 문자인지 바로 알 수 있어야 한다. */
export const SMS_BRAND_PREFIX = '[디몰링크]';

/**
 * 문자 1건 길이 상한(SMS 90바이트 ≈ 한글 45자). 넘으면 LMS 로 과금이 뛰므로
 * 문구를 줄여 SMS 안에 들어오게 한다. 자세한 내용은 앱에서 본다.
 */
export const SMS_MAX_KOREAN_CHARS = 45;

/** 알림 → 문자 본문. 접두사를 포함해 상한 안에 들어오게 자른다. */
export function formatNotificationSms(message: string): string {
  const room = SMS_MAX_KOREAN_CHARS - SMS_BRAND_PREFIX.length - 1;
  const body = message.length > room ? `${message.slice(0, room - 1)}…` : message;
  return `${SMS_BRAND_PREFIX} ${body}`;
}

export interface NotificationProviderLike {
  send(notification: AppNotification): void;
}

export class SmsNotificationProvider implements NotificationProviderLike {
  constructor(
    private readonly sender: SmsSender,
    private readonly lookupPhone: PhoneLookup,
    /** 인앱 기록·로그는 그대로 남기기 위해 기존 provider 를 감싼다. */
    private readonly inner?: NotificationProviderLike,
  ) {}

  send(notification: AppNotification): void {
    this.inner?.send(notification);
    if (!shouldSendSms(notification)) return;
    // 발송기가 임의 문구를 못 보내면(구식 구현) 조용히 인앱만 남긴다.
    if (!this.sender.sendText) return;

    // 상태 전이 처리를 막지 않도록 기다리지 않는다. 실패는 여기서 끝난다.
    void (async () => {
      try {
        const phone = await this.lookupPhone(notification.userId);
        if (!phone) return;
        await this.sender.sendText?.(phone, formatNotificationSms(notification.message));
      } catch {
        // 발송기가 이미 마스킹된 실패 로그를 남긴다. 여기서 번호를 다시 찍지 않는다.
      }
    })();
  }
}
