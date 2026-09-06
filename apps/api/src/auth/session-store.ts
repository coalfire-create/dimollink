import { randomUUID } from 'node:crypto';
import type { CollectionPersistence } from '../lib/json-collection.js';

export interface SessionStore {
  issue(userId: string): string | Promise<string>;
  resolve(token: string): (string | undefined) | Promise<string | undefined>;
  revoke(token: string): void | Promise<void>;
}

interface SessionEntry {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface PersistedSession extends SessionEntry {
  token: string;
}

export interface SessionTokenStoreOptions {
  ttlMs?: number;
  now?: () => number;
  persistence?: CollectionPersistence<PersistedSession>;
}

export class SessionTokenStore implements SessionStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly persistence?: CollectionPersistence<PersistedSession>;
  private readonly fallbackSessions = new Map<string, SessionEntry>();

  constructor(options: SessionTokenStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.persistence = options.persistence;
  }

  private async getInner(token: string): Promise<PersistedSession | undefined> {
    if (this.persistence) return this.persistence.get(token);
    const entry = this.fallbackSessions.get(token);
    if (!entry) return undefined;
    return { token, ...entry };
  }

  private async saveInner(session: PersistedSession): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(session);
    } else {
      this.fallbackSessions.set(session.token, {
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
    }
  }

  private async deleteInner(token: string): Promise<void> {
    if (this.persistence) {
      await this.persistence.delete(token);
    } else {
      this.fallbackSessions.delete(token);
    }
  }

  async issue(userId: string): Promise<string> {
    const token = randomUUID();
    const t = this.now();
    const session: PersistedSession = { token, userId, createdAt: t, expiresAt: t + this.ttlMs };
    await this.saveInner(session);
    return token;
  }

  async resolve(token: string): Promise<string | undefined> {
    const session = await this.getInner(token);
    if (!session) return undefined;
    if (this.now() > session.expiresAt) {
      await this.deleteInner(token);
      return undefined;
    }
    return session.userId;
  }

  async revoke(token: string): Promise<void> {
    await this.deleteInner(token);
  }
}
