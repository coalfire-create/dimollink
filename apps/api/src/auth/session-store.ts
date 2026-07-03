import { randomUUID } from 'node:crypto';

/**
 * 세션 토큰 저장소 — 자동 로그인용 불투명 토큰 ↔ 회원 매핑.
 *
 * 파일럿은 메모리 보관(서버 재시작 시 초기화)이라 단말은 토큰이 무효화되면 재로그인한다.
 * 운영에서는 DB/Redis + 만료·회수 정책으로 대체한다.
 * 토큰은 보안 값 — 로그에 평문으로 남기지 않는다.
 */

interface SessionEntry {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionTokenStoreOptions {
  /** 토큰 유효기간(ms). 기본 30일. */
  ttlMs?: number;
  now?: () => number;
}

export class SessionTokenStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(options: SessionTokenStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /** 회원에게 새 토큰 발급. */
  issue(userId: string): string {
    const token = randomUUID();
    const t = this.now();
    this.sessions.set(token, { userId, createdAt: t, expiresAt: t + this.ttlMs });
    return token;
  }

  /** 토큰 → 회원 ID. 만료/무효 시 undefined. */
  resolve(token: string): string | undefined {
    const entry = this.sessions.get(token);
    if (!entry) return undefined;
    if (this.now() > entry.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return entry.userId;
  }

  /** 로그아웃 — 토큰 회수. */
  revoke(token: string): void {
    this.sessions.delete(token);
  }
}
