import { describe, expect, it } from 'vitest';
import {
  canReceivePayout,
  maskAccountNumber,
  validatePayoutAccountInput,
  type PayoutAccount,
} from '@dimol/shared';
import { PayoutAccountStore } from './store.js';
import { UserStore } from '../users/store.js';

/**
 * 정산 계좌 — 계좌번호는 PII 다(CLAUDE.md 절대 규칙).
 * 여기서 못 박는 것: 응답에 원본이 새지 않는가, 미확인 계좌로 지급이 나가지 않는가.
 */

const BIZ = '1208147521';

async function setup() {
  const userStore = new UserStore();
  const company = await userStore.create({
    userType: 'DEMOLITION_COMPANY',
    name: '대한철거',
    region: '양평',
    phone: '01099990001',
    businessNumber: BIZ,
  } as never);
  const store = new PayoutAccountStore(userStore);
  return { store, userStore, company };
}

const VALID = { bankCode: '004', accountNumber: '12345678901234', holderName: '대한철거' };

describe('maskAccountNumber — 화면에 원본을 띄우지 않는다', () => {
  it('앞 3자리·뒤 3자리만 남긴다', () => {
    expect(maskAccountNumber('12345678901234')).toBe('123********234');
  });

  it('구분자가 있어도 숫자만 센다', () => {
    expect(maskAccountNumber('123-4567-8901')).toBe('123*****901');
  });

  it('너무 짧으면 통째로 가린다', () => {
    expect(maskAccountNumber('123456')).toBe('******');
  });
});

describe('validatePayoutAccountInput', () => {
  it('정상 입력은 통과', () => {
    expect(validatePayoutAccountInput(VALID).ok).toBe(true);
  });

  it('없는 은행 코드는 거부', () => {
    expect(validatePayoutAccountInput({ ...VALID, bankCode: '999' }).ok).toBe(false);
  });

  it('계좌번호 자릿수를 본다', () => {
    expect(validatePayoutAccountInput({ ...VALID, accountNumber: '123' }).ok).toBe(false);
    expect(validatePayoutAccountInput({ ...VALID, accountNumber: '1'.repeat(20) }).ok).toBe(false);
  });

  it('예금주명이 비면 거부', () => {
    expect(validatePayoutAccountInput({ ...VALID, holderName: '   ' }).ok).toBe(false);
  });
});

describe('PayoutAccountStore', () => {
  it('등록하면 마스킹된 형태만 돌려준다', async () => {
    const { store, company } = await setup();
    const saved = await store.register({ userId: company.id, ...VALID });
    expect(saved.maskedAccountNumber).toBe('123********234');
    expect(saved.bankName).toBe('KB국민은행');
    // 원본이 응답에 섞이면 안 된다.
    expect(JSON.stringify(saved)).not.toContain('12345678901234');
  });

  it('조회도 마스킹된다', async () => {
    const { store, company } = await setup();
    await store.register({ userId: company.id, ...VALID });
    const found = await store.get(company.id);
    expect(JSON.stringify(found)).not.toContain('12345678901234');
  });

  it('지급 실행 경로에서만 원본이 나온다', async () => {
    const { store, company } = await setup();
    await store.register({ userId: company.id, ...VALID });
    expect((await store.getRaw(company.id))?.accountNumber).toBe('12345678901234');
  });

  it('사업자번호는 가입 정보에서 가져온다 — 따로 받으면 세금계산서가 갈라진다', async () => {
    const { store, company } = await setup();
    await store.register({ userId: company.id, ...VALID });
    expect((await store.getRaw(company.id))?.businessNumber).toBe(BIZ);
  });

  it('소비자는 등록할 수 없다', async () => {
    const { store, userStore } = await setup();
    const consumer = await userStore.create({
      userType: 'CONSUMER',
      name: '배출자',
      region: '양평',
      phone: '01099990002',
    } as never);
    await expect(store.register({ userId: consumer.id, ...VALID })).rejects.toThrow('업체 회원만');
  });

  it('등록 직후에는 항상 미확인이다 — 확인된 척하지 않는다', async () => {
    const { store, company } = await setup();
    expect((await store.register({ userId: company.id, ...VALID })).verification).toBe('UNVERIFIED');
  });

  it('계좌를 바꾸면 실명확인이 되돌아간다', async () => {
    const { store, company } = await setup();
    await store.register({ userId: company.id, ...VALID });
    await store.markVerification(company.id, 'VERIFIED');
    expect((await store.get(company.id))?.verification).toBe('VERIFIED');

    // 이전 확인 결과는 이전 계좌에 대한 것이라 새 계좌에는 의미가 없다.
    const changed = await store.register({
      userId: company.id,
      ...VALID,
      accountNumber: '99998888777766',
    });
    expect(changed.verification).toBe('UNVERIFIED');
  });

  it('실패 사유에 계좌번호가 들어가지 않는다', async () => {
    const { store, company } = await setup();
    await store.register({ userId: company.id, ...VALID });
    const failed = await store.markVerification(company.id, 'FAILED', 'HOLDER_NAME_MISMATCH');
    expect(JSON.stringify(failed)).not.toContain('12345678901234');
    expect(failed.verificationError).toBe('HOLDER_NAME_MISMATCH');
  });
});

describe('canReceivePayout — 미확인 계좌로 돈을 보내면 안 된다', () => {
  const account: PayoutAccount = {
    userId: 'u1',
    bankCode: '004',
    accountNumber: '12345678901234',
    holderName: '대한철거',
    businessNumber: BIZ,
    verification: 'UNVERIFIED',
    updatedAt: new Date().toISOString(),
  };

  it('계좌가 없으면 지급 불가', () => {
    expect(canReceivePayout(undefined).ok).toBe(false);
  });

  it('실명확인 전이면 지급 불가 — 한 자리 틀리면 남의 통장으로 간다', () => {
    expect(canReceivePayout(account).ok).toBe(false);
  });

  it('실패한 계좌도 지급 불가', () => {
    expect(canReceivePayout({ ...account, verification: 'FAILED' }).ok).toBe(false);
  });

  it('확인된 계좌만 지급 가능', () => {
    expect(canReceivePayout({ ...account, verification: 'VERIFIED' }).ok).toBe(true);
  });
});
