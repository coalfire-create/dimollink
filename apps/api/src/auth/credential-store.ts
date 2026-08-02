import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 비밀번호 자격증명 저장소 — 번호+비밀번호 로그인용.
 * 비밀번호 해시는 UserProfile(응답 객체)과 분리해 여기서만 보관한다(응답 노출 방지).
 * 해시: scrypt(salt 16B, 64B). 저장 형식 `scrypt$<salt hex>$<hash hex>`.
 * PII/보안 값 — 로그에 남기지 않는다.
 */

export interface CredentialRecord {
  userId: string;
  /** 정규화된 휴대폰번호(숫자만) — 로그인 조회 키. */
  phoneKey: string;
  passwordHash: string;
  updatedAt: string;
}

function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyHash(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 비밀번호 정책 — 최소 6자(고령 사용자 접근성 고려, 과하지 않게). */
export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 6 && password.length <= 100;
}

export class CredentialStore {
  private readonly byUser = new Map<string, CredentialRecord>();
  private readonly byPhone = new Map<string, CredentialRecord>();

  constructor(private readonly persistence?: CollectionPersistence<CredentialRecord>) {
    for (const rec of persistence?.load() ?? []) {
      this.byUser.set(rec.userId, rec);
      this.byPhone.set(rec.phoneKey, rec);
    }
  }

  private persist(): void {
    this.persistence?.save([...this.byUser.values()]);
  }

  /** 비밀번호 설정/변경. 가입 시(비밀번호 제공) 또는 변경 시 호출. */
  setPassword(userId: string, phone: string, password: string): void {
    const rec: CredentialRecord = {
      userId,
      phoneKey: normalizePhone(phone),
      passwordHash: hashPassword(password),
      updatedAt: new Date().toISOString(),
    };
    // 기존 번호 키가 있으면 정리(번호 변경 대비).
    const prev = this.byUser.get(userId);
    if (prev && prev.phoneKey !== rec.phoneKey) this.byPhone.delete(prev.phoneKey);
    this.byUser.set(userId, rec);
    this.byPhone.set(rec.phoneKey, rec);
    this.persist();
  }

  /** 번호+비밀번호 검증 → 일치 시 userId 반환, 아니면 null. */
  verify(phone: string, password: string): string | null {
    const rec = this.byPhone.get(normalizePhone(phone));
    if (!rec) return null;
    return verifyHash(password, rec.passwordHash) ? rec.userId : null;
  }

  hasPassword(userId: string): boolean {
    return this.byUser.has(userId);
  }
}
