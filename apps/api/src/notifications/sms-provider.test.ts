import { describe, expect, it, vi } from 'vitest';
import { shouldSendSms, type AppNotification } from '@dimol/shared';
import {
  SMS_BRAND_PREFIX,
  SMS_MAX_KOREAN_CHARS,
  SmsNotificationProvider,
  formatNotificationSms,
} from './sms-provider.js';

/**
 * 매칭 알림 문자 발송.
 *
 * 두 가지가 어긋나면 안 된다: (1) 발송 실패가 매칭 흐름을 막는 것,
 * (2) 채팅까지 문자로 나가 비용이 터지고 사용자가 수신거부를 누르는 것.
 * 둘 다 운영에서야 드러나는 종류라 여기서 못 박는다.
 */

function notification(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    userId: 'u1',
    requestId: 'r1',
    status: 'MATCHED',
    message: '업체 매칭이 확정되었습니다. 결제를 진행해 주세요.',
    kind: 'STATUS',
    createdAt: new Date().toISOString(),
    ...over,
  };
}

/** 비동기 발송이 끝나길 기다린다(send 는 기다리지 않고 돌아온다). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('shouldSendSms — 채널 판단', () => {
  it('상태·콜은 보내고 채팅은 보내지 않는다', () => {
    expect(shouldSendSms({ kind: 'STATUS' })).toBe(true);
    expect(shouldSendSms({ kind: 'CALL' })).toBe(true);
    expect(shouldSendSms({ kind: 'CHAT' })).toBe(false);
  });

  it('kind 가 없는 옛 기록은 상태 알림으로 본다', () => {
    expect(shouldSendSms({})).toBe(true);
  });
});

describe('formatNotificationSms — SMS 한 건에 들어와야 한다', () => {
  it('브랜드 접두사를 붙인다', () => {
    expect(formatNotificationSms('결제 완료')).toBe(`${SMS_BRAND_PREFIX} 결제 완료`);
  });

  it('긴 문구는 잘라 SMS 상한 안에 넣는다 — 넘기면 LMS 로 과금이 뛴다', () => {
    const text = formatNotificationSms('가'.repeat(200));
    expect(text.length).toBeLessThanOrEqual(SMS_MAX_KOREAN_CHARS);
    expect(text.endsWith('…')).toBe(true);
  });

  it('실제 템플릿이 잘리지 않고 들어간다', () => {
    const text = formatNotificationSms('업체 매칭이 확정되었습니다. 결제를 진행해 주세요.');
    expect(text.length).toBeLessThanOrEqual(SMS_MAX_KOREAN_CHARS);
    expect(text).not.toContain('…');
  });
});

describe('SmsNotificationProvider', () => {
  it('상태 알림을 조회한 번호로 보낸다', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const provider = new SmsNotificationProvider(
      { send: vi.fn(), sendText },
      () => '01012345678',
    );
    provider.send(notification());
    await flush();
    expect(sendText).toHaveBeenCalledWith('01012345678', expect.stringContaining('매칭이 확정'));
  });

  it('채팅 알림은 문자로 보내지 않는다', async () => {
    const sendText = vi.fn();
    const provider = new SmsNotificationProvider({ send: vi.fn(), sendText }, () => '01012345678');
    provider.send(notification({ kind: 'CHAT', message: '[새 메시지] 안녕하세요' }));
    await flush();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('번호가 없으면 조용히 넘어간다', async () => {
    const sendText = vi.fn();
    const provider = new SmsNotificationProvider({ send: vi.fn(), sendText }, () => undefined);
    provider.send(notification());
    await flush();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('발송이 실패해도 예외가 새어나가지 않는다 — 알림 때문에 매칭이 멈추면 안 된다', async () => {
    const provider = new SmsNotificationProvider(
      { send: vi.fn(), sendText: vi.fn().mockRejectedValue(new Error('Solapi 접수 거부')) },
      () => '01012345678',
    );
    expect(() => provider.send(notification())).not.toThrow();
    await flush();
  });

  it('번호 조회가 실패해도 예외가 새어나가지 않는다', async () => {
    const provider = new SmsNotificationProvider(
      { send: vi.fn(), sendText: vi.fn() },
      () => Promise.reject(new Error('DB 장애')),
    );
    expect(() => provider.send(notification())).not.toThrow();
    await flush();
  });

  it('인앱 기록은 문자와 무관하게 남는다', async () => {
    const inner = { send: vi.fn() };
    const provider = new SmsNotificationProvider(
      { send: vi.fn(), sendText: vi.fn().mockRejectedValue(new Error('x')) },
      () => '01012345678',
      inner,
    );
    const n = notification();
    provider.send(n);
    await flush();
    expect(inner.send).toHaveBeenCalledWith(n);
  });

  it('임의 문구를 못 보내는 발송기면 인앱만 남긴다', async () => {
    const inner = { send: vi.fn() };
    const provider = new SmsNotificationProvider({ send: vi.fn() }, () => '01012345678', inner);
    provider.send(notification());
    await flush();
    expect(inner.send).toHaveBeenCalled();
  });
});
