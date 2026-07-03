import { PILOT } from '@dimol/shared';
import type { UserStore } from '../users/store.js';

/**
 * 테스트/스테이징 배포용 역할별 계정 시드(멱등).
 * SEED_TEST_ACCOUNTS=true 일 때만 기동 시 호출한다. 운영에서는 사용하지 않는다.
 * 로그인은 휴대폰번호 + 테스트 OTP 코드(ALLOW_TEST_OTP=true 시 123456)로 한다.
 */
interface SeedSpec {
  userType: 'CONSUMER' | 'DEMOLITION_COMPANY' | 'TRANSPORT_COMPANY' | 'WASTE_TREATMENT_PLANT';
  name: string;
  phone: string;
  businessNumber?: string; // 체크섬 통과 값(실존 업체 무관)
  online?: boolean;
}

const TEST_ACCOUNTS: SeedSpec[] = [
  { userType: 'CONSUMER', name: '김소비(테스트)', phone: '01011110001' },
  { userType: 'DEMOLITION_COMPANY', name: '대한철거(테스트)', phone: '01022220002', businessNumber: '1208147521' },
  { userType: 'TRANSPORT_COMPANY', name: '신속운반(테스트)', phone: '01033330003', businessNumber: '1234567891', online: true },
  { userType: 'WASTE_TREATMENT_PLANT', name: '푸른처리장(테스트)', phone: '01044440004', businessNumber: '1010101013' },
];

export function seedTestAccounts(userStore: UserStore): void {
  let created = 0;
  for (const spec of TEST_ACCOUNTS) {
    if (userStore.getByPhone(spec.phone)) continue; // 이미 있으면 건너뜀(멱등).
    try {
      const user = userStore.create({
        userType: spec.userType,
        name: spec.name,
        region: PILOT.region,
        phone: spec.phone,
        businessNumber: spec.businessNumber,
      });
      userStore.setApprovalStatus(user.id, 'APPROVED'); // 업체는 즉시 승인(테스트 편의).
      if (spec.online) userStore.setAvailability(user.id, 'ONLINE');
      created += 1;
    } catch (err) {
      console.warn('[seed] 테스트 계정 생성 실패', spec.phone, err instanceof Error ? err.message : 'error');
    }
  }
  if (created > 0) console.log(`[seed] 테스트 계정 ${created}개 생성(휴대폰번호 + OTP 123456 로 로그인)`);
}
