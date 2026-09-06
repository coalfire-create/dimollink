import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { CollectionPersistence } from '../lib/json-collection.js';

export interface CredentialRecord {
  userId: string;
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

export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 6 && password.length <= 100;
}

export class CredentialStore {
  private readonly fallbackMap = new Map<string, CredentialRecord>();

  constructor(private readonly persistence?: CollectionPersistence<CredentialRecord>) {}

  private async getInner(userId: string): Promise<CredentialRecord | undefined> {
    if (this.persistence) return this.persistence.get(userId);
    return this.fallbackMap.get(userId);
  }

  private async listInner(): Promise<CredentialRecord[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async saveInner(record: CredentialRecord): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(record);
    } else {
      this.fallbackMap.set(record.userId, record);
    }
  }

  async setPassword(userId: string, phone: string, password: string): Promise<void> {
    const rec: CredentialRecord = {
      userId,
      phoneKey: normalizePhone(phone),
      passwordHash: hashPassword(password),
      updatedAt: new Date().toISOString(),
    };
    await this.saveInner(rec);
  }

  async verify(phone: string, password: string): Promise<string | null> {
    const phoneKey = normalizePhone(phone);
    const all = await this.listInner();
    const rec = all.find(r => r.phoneKey === phoneKey);
    if (!rec) return null;
    return verifyHash(password, rec.passwordHash) ? rec.userId : null;
  }

  async hasPassword(userId: string): Promise<boolean> {
    const rec = await this.getInner(userId);
    return !!rec;
  }
}
