import { describe, expect, it } from 'vitest';
import { UserStore, UserValidationError, type CreateUserInput } from './store.js';

// 검증용 유효 사업자번호 (체크섬 통과값). 실존 업체와 무관.
const VALID_BIZ = '1208147521';
const VALID_BIZ2 = '1234567891';

const consumer: CreateUserInput = {
  userType: 'CONSUMER',
  name: '김배출',
  region: '양평',
  phone: '010-1111-1111',
};
const transport: CreateUserInput = {
  userType: 'TRANSPORT_COMPANY',
  name: '양평운반(주)',
  region: '양평',
  phone: '010-2222-2222',
  businessNumber: VALID_BIZ,
};
const disposal: CreateUserInput = {
  userType: 'WASTE_TREATMENT_PLANT',
  name: '양평처리장',
  region: '양평',
  phone: '010-3333-3333',
  businessNumber: VALID_BIZ2,
};

describe('UserStore.create — 온보딩', () => {
  it('소비자는 가입 즉시 승인(APPROVED), 콜대기 미설정', () => {
    const store = new UserStore();
    const u = store.create(consumer);
    expect(u.userType).toBe('CONSUMER');
    expect(u.approvalStatus).toBe('APPROVED');
    expect(u.allbaroCertified).toBe(false);
    expect(u.availability).toBeUndefined();
  });

  it('업체는 승인 대기(PENDING)로 시작 — 관리자 승인 대상', () => {
    const store = new UserStore();
    expect(store.create(transport).approvalStatus).toBe('PENDING');
    expect(store.create(disposal).approvalStatus).toBe('PENDING');
  });

  it('운반업체는 콜대기 OFFLINE 로 시작', () => {
    const store = new UserStore();
    expect(store.create(transport).availability).toBe('OFFLINE');
  });

  it('운반업체 외 업체는 콜대기 필드가 없다', () => {
    const store = new UserStore();
    expect(store.create(disposal).availability).toBeUndefined();
  });

  it('업체는 유효한 사업자등록번호 필수 (형식·체크섬)', () => {
    const store = new UserStore();
    expect(() => store.create({ ...transport, businessNumber: undefined })).toThrow(
      UserValidationError,
    );
    expect(() => store.create({ ...transport, businessNumber: '1234567890' })).toThrow(
      UserValidationError,
    );
  });

  it('사업자등록번호는 하이픈 입력 허용, 정규화 저장 + 중복 가입 거부', () => {
    const store = new UserStore();
    const u = store.create({ ...transport, businessNumber: '120-81-47521' });
    expect(u.businessNumber).toBe(VALID_BIZ);
    expect(() => store.create({ ...transport, name: '다른상호' })).toThrow(UserValidationError);
  });

  it('알 수 없는 가입 유형 거부', () => {
    const store = new UserStore();
    expect(() =>
      store.create({ ...consumer, userType: 'DRIVER' as CreateUserInput['userType'] }),
    ).toThrow(UserValidationError);
  });

  it('전국 어느 지역이든 가입 가능(전국구), 빈 지역만 거부', () => {
    const store = new UserStore();
    expect(store.create({ ...consumer, region: '서울' }).region).toBe('서울');
    expect(store.create({ ...consumer, phone: '010-9999-0000', region: '부산' }).region).toBe('부산');
    expect(() => store.create({ ...consumer, phone: '010-9999-0001', region: '  ' })).toThrow(
      UserValidationError,
    );
  });

  it('휴대폰번호 필수 (로그인 식별자)', () => {
    const store = new UserStore();
    expect(() => store.create({ ...consumer, phone: undefined })).toThrow(UserValidationError);
    expect(() => store.create({ ...consumer, phone: '010-123' })).toThrow(UserValidationError);
  });

  it('휴대폰번호 중복 가입 거부 (하이픈 무시 비교)', () => {
    const store = new UserStore();
    store.create(consumer);
    expect(() => store.create({ ...transport, phone: '01011111111' })).toThrow(
      UserValidationError,
    );
  });
});

describe('UserStore.getByPhone — 로그인 조회', () => {
  it('가입한 휴대폰번호로 계정 조회 (하이픈·공백 무시)', () => {
    const store = new UserStore();
    const u = store.create(consumer);
    expect(store.getByPhone('010-1111-1111')?.id).toBe(u.id);
    expect(store.getByPhone('010 1111 1111')?.id).toBe(u.id);
  });

  it('미가입 번호는 undefined', () => {
    const store = new UserStore();
    store.create(consumer);
    expect(store.getByPhone('010-9999-9999')).toBeUndefined();
  });
});

describe('UserStore — 콜대기·배지·인증·승인 갱신', () => {
  it('운반업체 콜대기 상태 토글 (ONLINE/OFFLINE)', () => {
    const store = new UserStore();
    const u = store.create(transport);
    expect(store.setAvailability(u.id, 'ONLINE').availability).toBe('ONLINE');
    expect(store.setAvailability(u.id, 'OFFLINE').availability).toBe('OFFLINE');
  });

  it('콜대기 상태 변경은 운반업체만 가능', () => {
    const store = new UserStore();
    const person = store.create(consumer);
    const plant = store.create(disposal);
    expect(() => store.setAvailability(person.id, 'ONLINE')).toThrow(UserValidationError);
    expect(() => store.setAvailability(plant.id, 'ONLINE')).toThrow(UserValidationError);
  });

  it('올바로 인증 배지 갱신 (검증 라우트가 호출하는 경로)', () => {
    const store = new UserStore();
    const u = store.create(transport);
    const checkedAt = new Date().toISOString();
    const updated = store.setAllbaroCertified(u.id, true, checkedAt);
    expect(updated.allbaroCertified).toBe(true);
    expect(updated.allbaroCheckedAt).toBe(checkedAt);
  });

  it('보험/허가증 등록은 업체만 가능', () => {
    const store = new UserStore();
    const company = store.create(transport);
    const person = store.create(consumer);
    expect(store.setCertifications(company.id, { insuranceRegistered: true }).insuranceRegistered).toBe(true);
    expect(() => store.setCertifications(person.id, { permitRegistered: true })).toThrow(
      UserValidationError,
    );
  });

  it('처리장 운반요청 제공 여부 토글 (처리장만 가능)', () => {
    const store = new UserStore();
    const plant = store.create(disposal);
    const company = store.create(transport);
    expect(store.setOffersTransport(plant.id, true).offersTransport).toBe(true);
    expect(store.setOffersTransport(plant.id, false).offersTransport).toBe(false);
    // 처리장이 아닌 유형은 거부.
    expect(() => store.setOffersTransport(company.id, true)).toThrow(UserValidationError);
  });

  it('승인/정지 상태 변경 (백오피스 경로)', () => {
    const store = new UserStore();
    const u = store.create(transport);
    expect(store.setApprovalStatus(u.id, 'APPROVED').approvalStatus).toBe('APPROVED');
    expect(store.setApprovalStatus(u.id, 'SUSPENDED').approvalStatus).toBe('SUSPENDED');
  });

  it('유형/승인상태 필터 목록', () => {
    const store = new UserStore();
    store.create(consumer);
    store.create(transport);
    expect(store.list({ userType: 'TRANSPORT_COMPANY' })).toHaveLength(1);
    expect(store.list({ approvalStatus: 'PENDING' })).toHaveLength(1);
  });
});

describe('UserStore — 소셜 신원 연결', () => {
  const identity = {
    provider: 'kakao' as const,
    providerUserId: 'kakao-123',
    email: 'a@k.com',
    linkedAt: '2026-07-24T00:00:00.000Z',
  };

  it('가입 시 소셜 신원을 함께 저장하고 조회한다', () => {
    const store = new UserStore();
    const u = store.create({ ...consumer, socialIdentity: identity });
    expect(u.socialIdentities).toEqual([identity]);
    expect(store.getBySocialIdentity('kakao', 'kakao-123')?.id).toBe(u.id);
    expect(store.getBySocialIdentity('kakao', '없음')).toBeUndefined();
    expect(store.getBySocialIdentity('naver', 'kakao-123')).toBeUndefined();
  });

  it('로그인 계정에 소셜 신원을 연결(멱등)한다', () => {
    const store = new UserStore();
    const u = store.create(consumer);
    const linked = store.linkSocialIdentity(u.id, identity);
    expect(linked.socialIdentities).toEqual([identity]);
    // 동일 신원 재연결은 그대로.
    expect(store.linkSocialIdentity(u.id, identity).socialIdentities).toHaveLength(1);
  });

  it('공급자당 하나만 유지 — 같은 공급자 재연결은 교체', () => {
    const store = new UserStore();
    const u = store.create(consumer);
    store.linkSocialIdentity(u.id, identity);
    const replaced = store.linkSocialIdentity(u.id, { ...identity, providerUserId: 'kakao-999' });
    expect(replaced.socialIdentities).toHaveLength(1);
    expect(replaced.socialIdentities?.[0]?.providerUserId).toBe('kakao-999');
  });
});
