import { env } from '../config/env.js';
import { ConsoleSmsSender, type SmsSender } from './otp-service.js';

/**
 * 실 SMS 발송 어댑터.
 * 범용 REST 발송 API(JSON: { to, from, text })에 맞춘 구현으로, 공급사별 스펙에 맞게
 * URL/헤더/필드만 조정하면 된다. 미설정 시 ConsoleSmsSender(개발)로 폴백한다.
 *
 * 보안: 인증코드·휴대폰번호는 로그에 평문으로 남기지 않는다(마스킹).
 */

export interface HttpSmsSenderConfig {
  apiUrl: string;
  apiKey: string;
  sender: string;
  timeoutMs: number;
}

function maskPhone(input: string): string {
  const d = input.replace(/\D/g, '');
  return d.length < 4 ? '***' : `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export class HttpSmsSender implements SmsSender {
  constructor(
    private readonly config: HttpSmsSenderConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(phone: string, code: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await this.fetchFn(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          to: phone.replace(/\D/g, ''),
          from: this.config.sender,
          text: `[디몰링크] 인증번호 ${code} 를 입력해 주세요.`,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 응답 본문에 민감정보가 있을 수 있어 status 만 남긴다.
        throw new Error(`SMS 발송 실패 (status=${res.status})`);
      }
    } catch (err) {
      console.warn(`[sms] 발송 실패 ${maskPhone(phone)}`, err instanceof Error ? err.name : 'error');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 환경설정 기반 SMS 발송기. 미설정 시 콘솔 폴백(운영이면 경고). */
export function createSmsSender(fetchFn: typeof fetch = fetch): SmsSender {
  const { apiUrl, apiKey, sender, timeoutMs } = env.sms;
  if (apiUrl && apiKey && sender) {
    return new HttpSmsSender({ apiUrl, apiKey, sender, timeoutMs }, fetchFn);
  }
  if (env.isProduction) {
    console.warn('[sms] 경고: SMS 발송 설정(SMS_API_URL/KEY/SENDER) 누락 — 콘솔 폴백 사용 중(운영 부적합).');
  }
  return new ConsoleSmsSender();
}
