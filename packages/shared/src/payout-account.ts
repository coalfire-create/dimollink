/**
 * 업체 정산 계좌 — 플랫폼이 정산금을 보낼 곳.
 *
 * 파트너정산(PG 지급대행)을 쓰든 직접 이체를 하든, **어느 PG를 고르더라도 이 정보는
 * 똑같이 필요하다**(은행·계좌번호·예금주·사업자번호). 그래서 PG 규격이 확정되기 전에
 * 만들어도 버려지지 않는다.
 *
 * ⚠️ 계좌번호는 PII 다(CLAUDE.md 절대 규칙). 지켜야 할 것:
 *  - 응답에는 **마스킹해서** 내보낸다. 본인에게도 전체를 다시 보여줄 이유가 없다
 *    (등록할 때 이미 알고 있고, 화면에 띄우면 어깨너머로 새어나간다).
 *  - 로그에 평문으로 남기지 않는다.
 *  - 검색·조회 키로 쓰지 않는다.
 */

/** 국내 주요 은행 코드(금융결제원 표준). 정산 계좌 선택에 쓴다. */
export const KOREAN_BANKS: readonly { code: string; name: string }[] = [
  { code: '004', name: 'KB국민은행' },
  { code: '011', name: 'NH농협은행' },
  { code: '020', name: '우리은행' },
  { code: '081', name: '하나은행' },
  { code: '088', name: '신한은행' },
  { code: '003', name: 'IBK기업은행' },
  { code: '023', name: 'SC제일은행' },
  { code: '027', name: '한국씨티은행' },
  { code: '031', name: '대구은행' },
  { code: '032', name: '부산은행' },
  { code: '034', name: '광주은행' },
  { code: '035', name: '제주은행' },
  { code: '037', name: '전북은행' },
  { code: '039', name: '경남은행' },
  { code: '045', name: '새마을금고' },
  { code: '048', name: '신협' },
  { code: '071', name: '우체국' },
  { code: '090', name: '카카오뱅크' },
  { code: '089', name: '케이뱅크' },
  { code: '092', name: '토스뱅크' },
];

export function bankName(code: string): string | undefined {
  return KOREAN_BANKS.find((b) => b.code === code)?.name;
}

/**
 * 계좌 실명확인 상태.
 *
 * PG 의 계좌 실명조회(예금주 확인) API 를 붙이기 전까지는 전부 UNVERIFIED 다.
 * **미확인 상태로 지급하면 안 된다** — 계좌번호를 한 자리 잘못 적으면 남의 통장으로
 * 돈이 가고, 되돌리려면 수취인 동의가 필요하다. 상태를 명시적으로 들고 다니는 이유다.
 */
export type PayoutAccountVerification = 'UNVERIFIED' | 'VERIFIED' | 'FAILED';

export interface PayoutAccount {
  /** 업체 회원 id. 한 업체당 계좌 하나. */
  userId: string;
  bankCode: string;
  /** 계좌번호(숫자만, PII). 응답에는 절대 그대로 넣지 않는다. */
  accountNumber: string;
  /** 예금주명. 사업자등록증상 상호와 일치해야 PG 심사를 통과한다. */
  holderName: string;
  /** 정산·세금계산서용 사업자등록번호(정규화 10자리, PII). */
  businessNumber: string;
  verification: PayoutAccountVerification;
  /** 실명조회 실패 사유(코드/요약). 계좌번호를 담지 않는다. */
  verificationError?: string;
  updatedAt: string;
}

/**
 * 계좌번호 마스킹 — 앞 3자리와 뒤 3자리만 남긴다.
 * 본인이 "어느 계좌였는지" 알아볼 만큼만 보여주고 나머지는 가린다.
 */
export function maskAccountNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length <= 6) return '*'.repeat(digits.length);
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 6)}${digits.slice(-3)}`;
}

/** 응답으로 내보낼 수 있는 형태. 계좌번호는 마스킹되고 원본은 남지 않는다. */
export interface SafePayoutAccount {
  userId: string;
  bankCode: string;
  bankName?: string;
  /** 마스킹된 계좌번호. 원본은 서버에만 있다. */
  maskedAccountNumber: string;
  holderName: string;
  verification: PayoutAccountVerification;
  verificationError?: string;
  updatedAt: string;
}

export function toSafePayoutAccount(account: PayoutAccount): SafePayoutAccount {
  return {
    userId: account.userId,
    bankCode: account.bankCode,
    bankName: bankName(account.bankCode),
    maskedAccountNumber: maskAccountNumber(account.accountNumber),
    holderName: account.holderName,
    verification: account.verification,
    verificationError: account.verificationError,
    updatedAt: account.updatedAt,
  };
}

export interface PayoutAccountValidation {
  ok: boolean;
  error?: string;
}

/** 계좌번호 자릿수 범위. 국내 은행 계좌는 10~14자리에 들어간다. */
export const ACCOUNT_NUMBER_MIN_DIGITS = 10;
export const ACCOUNT_NUMBER_MAX_DIGITS = 16;

/**
 * 입력값 검증. **형식만 본다** — 실제로 존재하는 계좌인지는 PG 실명조회가 확인한다.
 * 화면과 서버가 같은 답을 내야 해서 여기 하나로 둔다.
 */
export function validatePayoutAccountInput(input: {
  bankCode: string;
  accountNumber: string;
  holderName: string;
}): PayoutAccountValidation {
  if (!bankName(input.bankCode)) {
    return { ok: false, error: '은행을 선택해 주세요.' };
  }
  const digits = input.accountNumber.replace(/\D/g, '');
  if (digits.length < ACCOUNT_NUMBER_MIN_DIGITS || digits.length > ACCOUNT_NUMBER_MAX_DIGITS) {
    return {
      ok: false,
      error: `계좌번호는 숫자 ${ACCOUNT_NUMBER_MIN_DIGITS}~${ACCOUNT_NUMBER_MAX_DIGITS}자리로 입력해 주세요.`,
    };
  }
  const holder = input.holderName.trim();
  if (holder.length === 0) {
    return { ok: false, error: '예금주명을 입력해 주세요.' };
  }
  if (holder.length > 60) {
    return { ok: false, error: '예금주명이 너무 깁니다.' };
  }
  return { ok: true };
}

/**
 * 이 업체에 정산금을 보낼 수 있는가.
 *
 * 계좌가 없으면 당연히 못 보내고, 실명확인 전이면 **보내면 안 된다** — 한 자리만
 * 틀려도 남의 통장으로 가고 되돌리려면 수취인 동의가 필요하다.
 */
export function canReceivePayout(account: PayoutAccount | undefined): PayoutAccountValidation {
  if (!account) {
    return { ok: false, error: '정산 계좌가 등록되지 않았습니다.' };
  }
  if (account.verification !== 'VERIFIED') {
    return { ok: false, error: '정산 계좌 실명확인이 완료되지 않았습니다.' };
  }
  return { ok: true };
}
