import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { ConsoleSmsSender, type SmsSender } from './otp-service.js';

/**
 * 실 SMS 발송 어댑터.
 * - SolapiSmsSender: Solapi(구 CoolSMS) 문자 발송. HMAC-SHA256 서명 인증(REST v4).
 * - HttpSmsSender: 범용 REST 발송 API(JSON: { to, from, text }, Bearer 인증).
 * 미설정 시 ConsoleSmsSender(개발)로 폴백한다.
 *
 * 보안: 인증코드·휴대폰번호는 로그에 평문으로 남기지 않는다(마스킹). 응답 본문도 로그에 남기지 않는다.
 */

/** OTP 문자 본문. 발신 브랜드 태그를 앞에 붙인다(수신자 식별). */
export function formatOtpText(code: string): string {
  return `[디몰링크] 인증번호 ${code} 를 입력해 주세요.`;
}

function maskPhone(input: string): string {
  const d = input.replace(/\D/g, '');
  return d.length < 4 ? '***' : `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

export interface HttpSmsSenderConfig {
  apiUrl: string;
  apiKey: string;
  sender: string;
  timeoutMs: number;
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
          text: formatOtpText(code),
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

export interface SolapiSmsSenderConfig {
  apiKey: string;
  apiSecret: string;
  sender: string; // 발신번호(솔라피 콘솔에 사전 등록·인증 필요).
  timeoutMs: number;
}

/** 테스트 주입용 — 서명에 쓰는 date/salt 를 결정적으로 만들 수 있게 한다. */
export interface SolapiSignerDeps {
  now?: () => Date;
  salt?: () => string;
}

/**
 * Solapi 문자 발송기 — REST v4 단건 발송(POST /messages/v4/send).
 *
 * 인증: `Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...`
 *   - signature = HMAC-SHA256(apiSecret, date + salt) 를 hex 로 인코딩.
 *   - date 는 ISO8601, salt 는 매 요청 랜덤(재전송 공격 방지).
 * apiSecret 은 서명 계산에만 쓰고 네트워크로 전송하지 않는다.
 */
export class SolapiSmsSender implements SmsSender {
  private static readonly ENDPOINT = 'https://api.solapi.com/messages/v4/send';

  private readonly now: () => Date;
  private readonly salt: () => string;

  constructor(
    private readonly config: SolapiSmsSenderConfig,
    private readonly fetchFn: typeof fetch = fetch,
    deps: SolapiSignerDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.salt = deps.salt ?? (() => randomBytes(32).toString('hex'));
  }

  private authHeader(): string {
    const date = this.now().toISOString();
    const salt = this.salt();
    const signature = createHmac('sha256', this.config.apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${this.config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  async send(phone: string, code: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await this.fetchFn(SolapiSmsSender.ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        body: JSON.stringify({
          message: {
            to: phone.replace(/\D/g, ''),
            from: this.config.sender.replace(/\D/g, ''),
            text: formatOtpText(code),
          },
        }),
        signal: controller.signal,
      });
      // HTTP 레벨 실패.
      if (!res.ok) {
        throw new Error(`Solapi 발송 실패 (status=${res.status})`);
      }
      // Solapi 는 접수 실패도 200 + statusCode 로 알린다. "2000"(정상 접수) 계열만 성공 처리.
      let statusCode: string | undefined;
      try {
        const body = (await res.json()) as { statusCode?: string };
        statusCode = body?.statusCode;
      } catch {
        // 파싱 실패는 접수 여부 불명 — 실패로 간주.
        throw new Error('Solapi 응답 파싱 실패');
      }
      if (!statusCode || !statusCode.startsWith('2')) {
        // statusMessage 에 수신번호가 섞일 수 있어 코드만 남긴다.
        throw new Error(`Solapi 접수 거부 (statusCode=${statusCode ?? 'unknown'})`);
      }
    } catch (err) {
      console.warn(`[sms] 발송 실패 ${maskPhone(phone)}`, err instanceof Error ? err.name : 'error');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * 환경설정 기반 SMS 발송기 선택. 우선순위:
 *   1) Solapi(SOLAPI_API_KEY·SOLAPI_API_SECRET·SMS_SENDER 설정) — 권장.
 *   2) 범용 REST(SMS_API_URL·SMS_API_KEY·SMS_SENDER 설정).
 *   3) 콘솔 폴백(개발). 운영이면 경고.
 * SMS_PROVIDER 로 명시 선택도 가능(solapi | http | console).
 */
export function createSmsSender(fetchFn: typeof fetch = fetch): SmsSender {
  const { provider, sender, timeoutMs, apiUrl, apiKey, solapi } = env.sms;

  const solapiReady = Boolean(solapi.apiKey && solapi.apiSecret && sender);
  const httpReady = Boolean(apiUrl && apiKey && sender);

  const useSolapi = provider === 'solapi' || (provider === 'auto' && solapiReady);
  const useHttp = provider === 'http' || (provider === 'auto' && !solapiReady && httpReady);

  if (useSolapi) {
    if (!solapiReady) {
      throw new Error('SMS_PROVIDER=solapi 인데 SOLAPI_API_KEY/SOLAPI_API_SECRET/SMS_SENDER 가 누락되었습니다.');
    }
    return new SolapiSmsSender(
      { apiKey: solapi.apiKey!, apiSecret: solapi.apiSecret!, sender: sender!, timeoutMs },
      fetchFn,
    );
  }

  if (useHttp) {
    if (!httpReady) {
      throw new Error('SMS_PROVIDER=http 인데 SMS_API_URL/SMS_API_KEY/SMS_SENDER 가 누락되었습니다.');
    }
    return new HttpSmsSender({ apiUrl: apiUrl!, apiKey: apiKey!, sender: sender!, timeoutMs }, fetchFn);
  }

  if (env.isProduction) {
    console.warn('[sms] 경고: SMS 발송 설정(SOLAPI_* 또는 SMS_API_*) 누락 — 콘솔 폴백 사용 중(운영 부적합).');
  }
  return new ConsoleSmsSender();
}
