import { randomUUID } from 'node:crypto';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 세션 토큰 저장소 — 자동 로그인용 불투명 토큰 ↔ 회원 매핑.
 *
 * 영속화 어댑터를 주입하면 서버 재시작/배포에도 로그인이 유지된다(파일럿은 JSON 파일).
 * 운영에서는 Redis/DB 어댑터로 교체한다. 토큰은 보안 값 — 로그에 평문으로 남기지 않는다.
 */

interface SessionEntry {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/** 영속화 레코드(토큰 포함). */
export interface PersistedSession extends SessionEntry {
  token: string;
}

export interface SessionTokenStoreOptions {
  /** 토큰 유효기간(ms). 기본 30일. */
  ttlMs?: number;
  now?: () => number;
  /** 영속화 어댑터(선택). 미지정 시 메모리 전용. */
  persistence?: CollectionPersistence<PersistedSession>;
}

export class SessionTokenStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly persistence?: CollectionPersistence<PersistedSession>;
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(options: SessionTokenStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.persistence = options.persistence;
    // 재기동 시 만료되지 않은 세션만 복원.
    for (const s of this.persistence?.load() ?? []) {
      if (this.now() <= s.expiresAt) {
        this.sessions.set(s.token, { userId: s.userId, createdAt: s.createdAt, expiresAt: s.expiresAt });
      }
    }
  }

  private persist(): void {
    if (!this.persistence) return;
    const items: PersistedSession[] = [...this.sessions].map(([token, e]) => ({ token, ...e }));
    this.persistence.save(items);
  }

  /** 회원에게 새 토큰 발급. */
  issue(userId: string): string {
    const token = randomUUID();
    const t = this.now();
    this.sessions.set(token, { userId, createdAt: t, expiresAt: t + this.ttlMs });
    this.persist();
    return token;
  }

  /** 토큰 → 회원 ID. 만료/무효 시 undefined. */
  resolve(token: string): string | undefined {
    const entry = this.sessions.get(token);
    if (!entry) return undefined;
    if (this.now() > entry.expiresAt) {
      this.sessions.delete(token);
      this.persist();
      return undefined;
    }
    return entry.userId;
  }

  /** 로그아웃 — 토큰 회수. */
  revoke(token: string): void {
    if (this.sessions.delete(token)) this.persist();
  }
}
