import { describe, expect, it } from 'vitest';
import { memoryPersistenceFactory } from '../lib/memory-persistence.js';
import { SessionTokenStore, type PersistedSession } from './session-store.js';

describe('SessionTokenStore', () => {
  it('토큰 발급 후 회원 ID로 복원', async () => {
    const store = new SessionTokenStore();
    const token = await store.issue('user-1');
    expect(await store.resolve(token)).toBe('user-1');
  });

  it('알 수 없는 토큰은 undefined', async () => {
    const store = new SessionTokenStore();
    expect(await store.resolve('nope')).toBeUndefined();
  });

  it('로그아웃(revoke) 후에는 복원 불가', async () => {
    const store = new SessionTokenStore();
    const token = await store.issue('user-1');
    await store.revoke(token);
    expect(await store.resolve(token)).toBeUndefined();
  });

  it('만료된 토큰은 undefined', async () => {
    let now = 0;
    const store = new SessionTokenStore({ ttlMs: 1000, now: () => now });
    const token = await store.issue('user-1');
    now = 1500;
    expect(await store.resolve(token)).toBeUndefined();
  });

  it('발급된 토큰은 매번 다르다', async () => {
    const store = new SessionTokenStore();
    expect(await store.issue('user-1')).not.toBe(await store.issue('user-1'));
  });

  it('영속화하면 재기동(새 인스턴스)에도 세션이 복원된다', async () => {
    // 두 인스턴스가 같은 저장소를 공유(재기동 모사).
    const persistence = memoryPersistenceFactory()<PersistedSession>('sessions', (s) => s.token);
    const store = new SessionTokenStore({ persistence });
    const token = await store.issue('user-1');

    const restored = new SessionTokenStore({ persistence });
    expect(await restored.resolve(token)).toBe('user-1');

    await restored.revoke(token);
    const again = new SessionTokenStore({ persistence });
    expect(await again.resolve(token)).toBeUndefined();
  });
});
