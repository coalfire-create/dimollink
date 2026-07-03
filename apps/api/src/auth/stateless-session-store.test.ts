import { describe, expect, it } from 'vitest';
import { StatelessSessionStore } from './stateless-session-store.js';

describe('StatelessSessionStore', () => {
  it('발급 토큰을 (다른 인스턴스의) 같은 시크릿으로 검증한다', () => {
    const a = new StatelessSessionStore('secret-xyz', 60_000);
    const b = new StatelessSessionStore('secret-xyz', 60_000); // 다른 인스턴스 모사
    const token = a.issue('user-1');
    expect(b.resolve(token)).toBe('user-1');
  });

  it('시크릿이 다르면 검증 실패(위조 방지)', () => {
    const a = new StatelessSessionStore('secret-xyz', 60_000);
    const evil = new StatelessSessionStore('other-secret', 60_000);
    expect(evil.resolve(a.issue('user-1'))).toBeUndefined();
  });

  it('변조된 토큰은 거부', () => {
    const s = new StatelessSessionStore('secret-xyz', 60_000);
    const token = s.issue('user-1');
    expect(s.resolve(token + 'x')).toBeUndefined();
    expect(s.resolve('v1.abc.def')).toBeUndefined();
    expect(s.resolve('garbage')).toBeUndefined();
  });

  it('만료된 토큰은 거부', () => {
    let now = 0;
    const s = new StatelessSessionStore('secret-xyz', 1000, () => now);
    const token = s.issue('user-1');
    now = 2000;
    expect(s.resolve(token)).toBeUndefined();
  });
});
