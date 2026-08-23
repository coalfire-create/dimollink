import { CredentialStore, type CredentialRecord } from '../auth/credential-store.js';
import { env } from '../config/env.js';
import { createPgPool, initPgPersistence } from '../lib/pg-collection.js';
import { UserStore } from '../users/store.js';
import type { UserProfile } from '@dimol/shared';

/**
 * 일회성 유지보수 스크립트 — 역할별 로그인 테스트 계정을 실제 DB에 생성/보장한다.
 * `SEED_TEST_ACCOUNTS`/`ALLOW_TEST_OTP` 와 달리 OTP 마스터코드를 켜지 않는다.
 * 번호+비밀번호(정상 로그인 경로, `/api/auth/login`)로 바로 로그인 가능하게 비밀번호를 심는다.
 * 실행: `railway run -- npx tsx apps/api/src/dev/create-role-test-accounts.ts`
 */
const TEST_PASSWORD = 'test1234';

interface Spec {
  userType: UserProfile['userType'];
  name: string;
  phone: string;
  businessNumber?: string;
  online?: boolean;
}

const ACCOUNTS: Spec[] = [
  { userType: 'CONSUMER', name: '김소비(테스트)', phone: '01011110001' },
  { userType: 'DEMOLITION_COMPANY', name: '대한철거(테스트)', phone: '01022220002', businessNumber: '1208147521' },
  { userType: 'TRANSPORT_COMPANY', name: '신속운반(테스트)', phone: '01033330003', businessNumber: '1234567891', online: true },
  { userType: 'WASTE_TREATMENT_PLANT', name: '푸른처리장(테스트)', phone: '01044440004', businessNumber: '1010101013' },
  // 인테리어(밀봉 역경매)는 사업 확장 후로 미룬 기능 — 테스트 계정도 만들지 않는다.
  // 되살릴 땐 FEATURE_INTERIOR 를 켜고 INTERIOR_COMPANY 계정을 여기에 다시 추가한다.
];

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    console.error('DATABASE_URL 이 설정되어 있지 않습니다. `railway run`으로 실행했는지 확인하세요.');
    process.exit(1);
  }
  const pool = createPgPool(env.databaseUrl);
  const persistence = await initPgPersistence(pool);
  const userStore = new UserStore(persistence<UserProfile>('users'));
  const credentialStore = new CredentialStore(
    persistence<CredentialRecord>('credentials', (c) => c.userId),
  );

  const results: Array<{ role: string; name: string; phone: string }> = [];

  for (const spec of ACCOUNTS) {
    let user = userStore.getByPhone(spec.phone);
    if (!user) {
      user = userStore.create({
        userType: spec.userType,
        name: spec.name,
        region: '전국',
        phone: spec.phone,
        businessNumber: spec.businessNumber,
      });
    }
    userStore.setApprovalStatus(user.id, 'APPROVED');
    if (spec.online) userStore.setAvailability(user.id, 'ONLINE');
    credentialStore.setPassword(user.id, spec.phone, TEST_PASSWORD);
    results.push({ role: spec.userType, name: spec.name, phone: spec.phone });
  }

  // PgEntityStore.save()는 백그라운드 upsert(fire-and-forget)라 즉시 pool.end() 하면
  // 쓰기 전에 커넥션이 닫힌다 — 큐가 비워질 시간을 명시적으로 기다린다.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('테스트 계정 준비 완료 (비밀번호 공통):', TEST_PASSWORD);
  for (const r of results) {
    console.log(`- [${r.role}] ${r.name} · ${r.phone}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('테스트 계정 생성 실패:', err);
  process.exit(1);
});
