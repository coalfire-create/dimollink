import { describe, expect, it } from 'vitest';
import { SessionTokenStore } from './session-store.js';

describe('SessionTokenStore', () => {
  it('토큰 발급 후 회원 ID로 복원', () => {
    const store = new SessionTokenStore();
    const token = store.issue('user-1');
    expect(store.resolve(token)).toBe('user-1');
  });

  it('알 수 없는 토큰은 undefined', () => {
    const store = new SessionTokenStore();
    expect(store.resolve('nope')).toBeUndefined();
  });

  it('로그아웃(revoke) 후에는 복원 불가', () => {
    const store = new SessionTokenStore();
    const token = store.issue('user-1');
    store.revoke(token);
    expect(store.resolve(token)).toBeUndefined();
  });

  it('만료된 토큰은 undefined', () => {
    let now = 0;
    const store = new SessionTokenStore({ ttlMs: 1000, now: () => now });
    const token = store.issue('user-1');
    now = 1500;
    expect(store.resolve(token)).toBeUndefined();
  });

  it('발급된 토큰은 매번 다르다', () => {
    const store = new SessionTokenStore();
    expect(store.issue('user-1')).not.toBe(store.issue('user-1'));
  });
});
