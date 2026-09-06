import { env } from '../config/env.js';
import { createPgPool } from '../lib/pg-collection.js';

/**
 * 일회성 유지보수 스크립트 — 인테리어 테스트 계정을 운영 DB에서 제거한다.
 * 인테리어(밀봉 역경매)는 사업 확장 후로 미룬 기능이라 계정 자체를 남겨두지 않는다.
 * 실행: `railway run -- npx tsx apps/api/src/dev/remove-interior-test-accounts.ts`
 */
const TARGET_PHONES = ['01055550005', '01066660006'];

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    console.error('DATABASE_URL 이 없습니다. `railway run`으로 실행하세요.');
    process.exit(1);
  }
  const pool = createPgPool(env.databaseUrl);

  // 대상 확인 — 인테리어 업체 유형이면서 지정 번호인 계정만.
  const { rows } = await pool.query(
    `SELECT id, data->>'name' AS name, data->>'phone' AS phone, data->>'userType' AS user_type
       FROM entities
      WHERE collection = 'users'
        AND data->>'userType' = 'INTERIOR_COMPANY'
        AND data->>'phone' = ANY($1)`,
    [TARGET_PHONES],
  );

  if (rows.length === 0) {
    console.log('삭제할 인테리어 테스트 계정이 없습니다(이미 정리됨).');
    await pool.end();
    return;
  }

  const ids = rows.map((r) => r.id as string);
  console.log('삭제 대상:');
  for (const r of rows) console.log(`- ${r.name as string} · ${r.phone as string}`);

  // 로그인 자격증명(비밀번호)도 함께 제거 — 계정만 지우면 크리덴셜이 남는다.
  const cred = await pool.query(
    `DELETE FROM entities WHERE collection = 'credentials' AND data->>'userId' = ANY($1)`,
    [ids],
  );
  const users = await pool.query(
    `DELETE FROM entities WHERE collection = 'users' AND id = ANY($1)`,
    [ids],
  );

  console.log(`계정 ${users.rowCount}건, 자격증명 ${cred.rowCount}건 삭제 완료.`);
  await pool.end();
}

main().catch((err) => {
  console.error('인테리어 테스트 계정 삭제 실패:', err);
  process.exit(1);
});
