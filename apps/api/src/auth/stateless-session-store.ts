import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SessionStore } from './session-store.js';

function b64urlEncode(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/**
 * 무상태(서명) 세션 저장소 — 서버리스/다중 인스턴스에서 공유 저장소(Redis) 없이 동작한다.
 * 토큰 자체에 회원 id·만료를 담고 HMAC 서명해, 어느 인스턴스든 서명만 검증하면 된다.
 *
 * SESSION_SECRET 은 모든 인스턴스가 동일해야 하며(고정 env), 노출되면 위조 가능하므로 시크릿으로 관리.
 * 로그아웃(revoke)은 서버 상태가 없어 즉시 무효화가 불가 — 단말이 토큰을 폐기한다(테스트/파일럿 허용).
 */
export class StatelessSessionStore implements SessionStore {
  constructor(
    private readonly secret: string,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private sign(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  issue(userId: string): string {
    const payload = b64urlEncode(JSON.stringify({ u: userId, e: this.now() + this.ttlMs }));
    return `v1.${payload}.${this.sign(`v1.${payload}`)}`;
  }

  resolve(token: string): string | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return undefined;
    const payload = parts[1];
    const sig = parts[2];
    if (payload === undefined || sig === undefined) return undefined;
    const expected = this.sign(`v1.${payload}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    try {
      const parsed = JSON.parse(b64urlDecode(payload)) as {
        u?: unknown;
        e?: unknown;
      };
      if (typeof parsed.u !== 'string' || typeof parsed.e !== 'number') return undefined;
      if (this.now() > parsed.e) return undefined;
      return parsed.u;
    } catch {
      return undefined;
    }
  }

  revoke(): void {
    // 무상태 — 서버 폐기 불가. 단말 토큰 삭제로 로그아웃한다.
  }
}
