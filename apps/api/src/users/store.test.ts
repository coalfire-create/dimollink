import { describe, expect, it } from 'vitest';
import { UserStore, UserValidationError, type CreateUserInput } from './store.js';

// 검증용 유효 사업자번호 (체크섬 통과값). 실존 업체와 무관.
const VALID_BIZ = '1208147521';

const discharger: CreateUserInput = { role: 'DISCHARGER', name: '김배출', region: '양평' };
const transport: CreateUserInput = {
  role: 'TRANSPORT',
  name: '양평운반(주)',
  region: '양평',
  businessNumber: VALID_BIZ,
};

describe('UserStore.create — 온보딩', () => {
  it('배출자는 가입 즉시 승인(APPROVED)', () => {
    const store = new UserStore();
    const u = store.create(discharger);
    expect(u.approvalStatus).toBe('APPROVED');
    expect(u.allbaroCertified).toBe(false);
  });

  it('업체는 승인 대기(PENDING)로 시작 — 관리자 승인 대상', () => {
    const store = new UserStore();
    expect(store.create(transport).approvalStatus).toBe('PENDING');
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

  it('파일럿 지역(양평) 외 가입 거부', () => {
    const store = new UserStore();
    expect(() => store.create({ ...discharger, region: '서울' })).toThrow(UserValidationError);
  });
});

describe('UserStore — 배지·인증·승인 갱신', () => {
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
    const person = store.create(discharger);
    expect(store.setCertifications(company.id, { insuranceRegistered: true }).insuranceRegistered).toBe(true);
    expect(() => store.setCertifications(person.id, { permitRegistered: true })).toThrow(
      UserValidationError,
    );
  });

  it('승인/정지 상태 변경 (백오피스 경로)', () => {
    const store = new UserStore();
    const u = store.create(transport);
    expect(store.setApprovalStatus(u.id, 'APPROVED').approvalStatus).toBe('APPROVED');
    expect(store.setApprovalStatus(u.id, 'SUSPENDED').approvalStatus).toBe('SUSPENDED');
  });

  it('역할/승인상태 필터 목록', () => {
    const store = new UserStore();
    store.create(discharger);
    store.create(transport);
    expect(store.list({ role: 'TRANSPORT' })).toHaveLength(1);
    expect(store.list({ approvalStatus: 'PENDING' })).toHaveLength(1);
  });
});
