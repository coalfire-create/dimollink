import { randomInt } from 'node:crypto';

/**
 * 휴대폰 OTP(인증코드) 서비스 — 파일럿 인증.
 *
 * ⚠️ 실 SMS 발송사(알림톡/문자) 연동 전까지 ConsoleSmsSender 로 서버 로그에만 코드를 남긴다.
 *   운영 전환 시 SmsSender 를 실제 발송 구현으로 교체한다.
 * 보안: 인증코드는 PII/보안 값이라 저장 외 로그 노출을 최소화하고, 휴대폰번호는 마스킹해 남긴다.
 */

export type OtpErrorCode =
  | 'NOT_REQUESTED' // 요청 이력 없음(혹은 소진)
  | 'EXPIRED' // 코드 만료
  | 'TOO_MANY_ATTEMPTS' // 검증 시도 초과
  | 'INVALID_CODE' // 코드 불일치
  | 'RESEND_COOLDOWN'; // 재발송 쿨다운 중

export class OtpError extends Error {
  constructor(
    readonly code: OtpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OtpError';
  }
}

/** 인증코드 발송 채널. 테스트/운영에서 교체 가능. */
export interface SmsSender {
  send(phone: string, code: string): void | Promise<void>;
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

/** 로그용 마스킹 — 가운데를 가린다(예: 010-****-1234). PII 평문 로그 금지. */
function maskPhone(input: string): string {
  const d = normalizePhone(input);
  if (d.length < 4) return '***';
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

/** 개발/파일럿용 — 서버 콘솔에 마스킹 번호 + 코드만 출력. */
export class ConsoleSmsSender implements SmsSender {
  send(phone: string, code: string): void {
    console.info(`[otp] 인증코드 발송(sandbox) ${maskPhone(phone)} → ${code}`);
  }
}

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

export interface OtpServiceOptions {
  sender?: SmsSender;
  /** 코드 유효시간(ms). 기본 3분. */
  ttlMs?: number;
  /** 재발송 쿨다운(ms). 기본 30초. 짧은 시간 반복 발송(요금 폭탄) 차단. */
  resendCooldownMs?: number;
  /** 검증 최대 시도. 초과 시 코드 무효화. 기본 5회. */
  maxAttempts?: number;
  /** 인증 완료 후 회원가입까지 유효한 창(ms). 기본 10분. */
  verifiedWindowMs?: number;
  /**
   * 개발/테스트용 마스터 인증코드. 지정 시 이 코드로 언제나 검증을 통과한다.
   * 운영에서는 반드시 undefined 로 둔다(app.ts 가 비운영 환경에서만 주입).
   */
  devMasterCode?: string;
  /** 시각 주입(테스트용). */
  now?: () => number;
  /** 코드 생성기 주입(테스트용). 기본 6자리 난수. */
  generateCode?: () => string;
}

export class OtpService {
  private readonly sender: SmsSender;
  private readonly ttlMs: number;
  private readonly resendCooldownMs: number;
  private readonly maxAttempts: number;
  private readonly verifiedWindowMs: number;
  private readonly devMasterCode?: string;
  private readonly now: () => number;
  private readonly generateCode: () => string;

  private readonly pending = new Map<string, OtpEntry>();
  /** 인증 완료된 번호 → 만료시각. 회원가입 시 번호 인증 여부 확인용. */
  private readonly verified = new Map<string, number>();

  constructor(options: OtpServiceOptions = {}) {
    this.sender = options.sender ?? new ConsoleSmsSender();
    this.ttlMs = options.ttlMs ?? 3 * 60 * 1000;
    this.resendCooldownMs = options.resendCooldownMs ?? 30 * 1000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.verifiedWindowMs = options.verifiedWindowMs ?? 10 * 60 * 1000;
    this.devMasterCode = options.devMasterCode;
    this.now = options.now ?? Date.now;
    this.generateCode = options.generateCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));
  }

  /** 인증코드 발송. 유효시간(초)을 반환한다. 쿨다운 내 재요청은 거부한다. */
  async request(phoneInput: string): Promise<{ sent: boolean; expiresInSec: number }> {
    const key = normalizePhone(phoneInput);
    const existing = this.pending.get(key);
    if (existing && this.now() - existing.sentAt < this.resendCooldownMs) {
      throw new OtpError(
        'RESEND_COOLDOWN',
        '잠시 후 다시 시도해 주세요. 인증코드는 30초에 한 번 보낼 수 있어요.',
      );
    }
    const code = this.generateCode();
    const sentAt = this.now();
    this.pending.set(key, { code, expiresAt: sentAt + this.ttlMs, attempts: 0, sentAt });
    await this.sender.send(phoneInput, code);
    return { sent: true, expiresInSec: Math.floor(this.ttlMs / 1000) };
  }

  /**
   * 인증코드 검증. 성공 시 해당 번호를 '인증 완료' 창에 등록하고 true 반환.
   * 실패 시 OtpError(코드별)로 구분해 던진다.
   */
  verify(phoneInput: string, code: string): boolean {
    const key = normalizePhone(phoneInput);
    // 개발/테스트 마스터 코드(운영에서는 주입되지 않음).
    if (this.devMasterCode !== undefined && code.trim() === this.devMasterCode) {
      this.verified.set(key, this.now() + this.verifiedWindowMs);
      return true;
    }
    const entry = this.pending.get(key);
    if (!entry) {
      throw new OtpError('NOT_REQUESTED', '인증코드를 먼저 요청해 주세요.');
    }
    if (this.now() > entry.expiresAt) {
      this.pending.delete(key);
      throw new OtpError('EXPIRED', '인증코드가 만료되었습니다. 다시 요청해 주세요.');
    }
    entry.attempts += 1;
    if (entry.attempts > this.maxAttempts) {
      this.pending.delete(key);
      throw new OtpError('TOO_MANY_ATTEMPTS', '인증 시도가 너무 많습니다. 코드를 다시 요청해 주세요.');
    }
    if (entry.code !== String(code).trim()) {
      throw new OtpError('INVALID_CODE', '인증코드가 올바르지 않습니다.');
    }
    this.pending.delete(key);
    this.verified.set(key, this.now() + this.verifiedWindowMs);
    return true;
  }

  /** 번호가 최근 인증 완료 상태인지(회원가입 게이트). */
  isPhoneVerified(phoneInput: string): boolean {
    const key = normalizePhone(phoneInput);
    const expiresAt = this.verified.get(key);
    if (expiresAt === undefined) return false;
    if (this.now() > expiresAt) {
      this.verified.delete(key);
      return false;
    }
    return true;
  }

  /** 회원가입 완료 시 인증 창을 소진(1회성). */
  consumePhoneVerification(phoneInput: string): void {
    this.verified.delete(normalizePhone(phoneInput));
  }
}
