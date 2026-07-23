import type { OtpEntry, OtpKv } from './otp-service.js';

/**
 * PostgreSQL 기반 OTP 저장소 — 서버리스(다중 인스턴스)에서 인증코드/인증완료 상태를 공유한다.
 * Upstash/Redis 없이 기존 Neon Postgres 만으로 동작. TTL(expires_at)로 만료 행을 걸러내고 정리한다.
 * (인스턴스 A에서 코드 발송 → B에서 검증도 정상 동작.)
 */

/** pg.Pool 호환 최소 인터페이스(테스트 대체 가능). */
export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** OTP 저장 테이블 보장. 함수 콜드스타트 시 1회 호출. */
export async function ensureOtpSchema(pool: PgQueryable): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS otp_kv(
       kind text NOT NULL,
       key text NOT NULL,
       data jsonb NOT NULL,
       expires_at timestamptz NOT NULL,
       PRIMARY KEY(kind, key)
     )`,
  );
}

export class PgOtpKv implements OtpKv {
  constructor(private readonly pool: PgQueryable) {}

  private async upsert(kind: string, key: string, data: unknown, ttlMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO otp_kv(kind, key, data, expires_at)
       VALUES ($1, $2, $3::jsonb, now() + ($4 || ' milliseconds')::interval)
       ON CONFLICT (kind, key) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
      [kind, key, JSON.stringify(data), String(Math.max(1, Math.floor(ttlMs)))],
    );
  }

  private async read(kind: string, key: string): Promise<unknown | undefined> {
    const { rows } = await this.pool.query(
      `SELECT data FROM otp_kv WHERE kind = $1 AND key = $2 AND expires_at > now()`,
      [kind, key],
    );
    return rows.length > 0 ? rows[0]!.data : undefined;
  }

  private async remove(kind: string, key: string): Promise<void> {
    // 대상 삭제 + 만료 행 청소(테이블 비대화 방지).
    await this.pool.query(
      `DELETE FROM otp_kv WHERE (kind = $1 AND key = $2) OR expires_at <= now()`,
      [kind, key],
    );
  }

  async getPending(key: string): Promise<OtpEntry | undefined> {
    return (await this.read('pending', key)) as OtpEntry | undefined;
  }

  async setPending(key: string, entry: OtpEntry, ttlMs: number): Promise<void> {
    await this.upsert('pending', key, entry, ttlMs);
  }

  async deletePending(key: string): Promise<void> {
    await this.remove('pending', key);
  }

  async getVerifiedExpiry(key: string): Promise<number | undefined> {
    const data = (await this.read('verified', key)) as { expiresAt?: number } | undefined;
    return typeof data?.expiresAt === 'number' ? data.expiresAt : undefined;
  }

  async setVerified(key: string, expiresAt: number, ttlMs: number): Promise<void> {
    await this.upsert('verified', key, { expiresAt }, ttlMs);
  }

  async deleteVerified(key: string): Promise<void> {
    await this.remove('verified', key);
  }
}
