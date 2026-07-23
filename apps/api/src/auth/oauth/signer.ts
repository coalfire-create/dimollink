import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 서명된 단기 페이로드 — OAuth state(CSRF)·소셜 가입 티켓에 공용.
 * 서버 상태 없이 위조 방지 + 만료를 보장한다(StatelessSessionStore 와 같은 HMAC 방식).
 * secret 이 노출되면 위조 가능하므로 시크릿으로 관리한다.
 */

function b64urlEncode(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export class SignedPayload {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  private sig(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /** data 를 담아 서명한 토큰을 만든다. ttlMs 후 만료. */
  sign<T>(data: T, ttlMs: number): string {
    const body = b64urlEncode(JSON.stringify({ d: data, e: this.now() + ttlMs }));
    return `v1.${body}.${this.sig(`v1.${body}`)}`;
  }

  /** 서명·만료 검증 후 data 를 반환한다. 위조·만료·형식오류면 undefined. */
  verify<T>(token: string): T | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return undefined;
    const [, body, sig] = parts;
    if (body === undefined || sig === undefined) return undefined;
    const expected = this.sig(`v1.${body}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    try {
      const parsed = JSON.parse(b64urlDecode(body)) as { d?: T; e?: unknown };
      if (typeof parsed.e !== 'number' || this.now() > parsed.e) return undefined;
      return parsed.d;
    } catch {
      return undefined;
    }
  }
}
