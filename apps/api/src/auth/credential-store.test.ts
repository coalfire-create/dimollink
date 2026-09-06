import { describe, expect, it } from 'vitest';
import { CredentialStore, hashPassword, isValidPassword, verifyHash } from './credential-store.js';

describe('password hashing', () => {
  it('해시는 원문을 노출하지 않고 검증에 성공한다', () => {
    const h = hashPassword('secret123');
    expect(h).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(h).not.toContain('secret123');
    expect(verifyHash('secret123', h)).toBe(true);
    expect(verifyHash('wrong', h)).toBe(false);
  });

  it('같은 비밀번호도 salt 로 매번 다른 해시가 된다', () => {
    expect(hashPassword('samepw123')).not.toBe(hashPassword('samepw123'));
  });

  it('손상된 해시 형식은 false', () => {
    expect(verifyHash('x', 'not-a-hash')).toBe(false);
    expect(verifyHash('x', 'scrypt$onlyone')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('6자 이상만 허용', () => {
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword(123456)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });
});

describe('CredentialStore', () => {
  it('설정한 번호+비밀번호로만 로그인 검증된다', async () => {
    const store = new CredentialStore();
    await store.setPassword('user-1', '010-1234-5678', 'mypw12');
    expect(await store.verify('01012345678', 'mypw12')).toBe('user-1');
    expect(await store.verify('010-1234-5678', 'mypw12')).toBe('user-1'); // 하이픈 무시
    expect(await store.verify('01012345678', 'wrong')).toBeNull();
    expect(await store.verify('01099999999', 'mypw12')).toBeNull();
    expect(await store.hasPassword('user-1')).toBe(true);
    expect(await store.hasPassword('user-2')).toBe(false);
  });

  it('비밀번호 변경 시 이전 것으로는 로그인 안 된다', async () => {
    const store = new CredentialStore();
    await store.setPassword('u', '01011112222', 'oldpw1');
    await store.setPassword('u', '01011112222', 'newpw2');
    expect(await store.verify('01011112222', 'oldpw1')).toBeNull();
    expect(await store.verify('01011112222', 'newpw2')).toBe('u');
  });
});
