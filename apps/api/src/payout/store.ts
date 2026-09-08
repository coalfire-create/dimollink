import {
  toSafePayoutAccount,
  validatePayoutAccountInput,
  type PayoutAccount,
  type SafePayoutAccount,
} from '@dimol/shared';
import { normalizeBusinessNumber, isValidBusinessNumber } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { UserStore } from '../users/store.js';

/**
 * 정산 계좌 저장소.
 *
 * ⚠️ 레코드에 **계좌번호와 사업자등록번호**가 들어 있다(둘 다 PII). 이 클래스 밖으로
 * 원본을 내보내는 메서드는 `getRaw` 하나뿐이고, 그건 지급 실행에서만 쓴다.
 * 화면·API 로 나가는 경로는 전부 `toSafePayoutAccount` 를 거친다.
 */

export class PayoutAccountError extends Error {}

export interface RegisterPayoutAccountInput {
  userId: string;
  bankCode: string;
  accountNumber: string;
  holderName: string;
}

export class PayoutAccountStore {
  private readonly fallbackMap = new Map<string, PayoutAccount>();

  constructor(
    private readonly userStore: UserStore,
    private readonly persistence?: CollectionPersistence<PayoutAccount>,
  ) {}

  private async save(account: PayoutAccount): Promise<void> {
    if (this.persistence) await this.persistence.save(account);
    else this.fallbackMap.set(account.userId, account);
  }

  /**
   * 지급 실행 전용 — 계좌번호 원본이 나온다.
   * 응답으로 흘려보내지 말 것. 호출부는 지급 어댑터뿐이다.
   */
  async getRaw(userId: string): Promise<PayoutAccount | undefined> {
    if (this.persistence) return this.persistence.get(userId);
    return this.fallbackMap.get(userId);
  }

  /** 화면·API 용. 계좌번호가 마스킹된 형태만 나간다. */
  async get(userId: string): Promise<SafePayoutAccount | undefined> {
    const account = await this.getRaw(userId);
    return account ? toSafePayoutAccount(account) : undefined;
  }

  /**
   * 등록·수정. 계좌를 바꾸면 실명확인이 **처음으로 되돌아간다** —
   * 이전 확인 결과는 이전 계좌에 대한 것이라 새 계좌에는 의미가 없다.
   */
  async register(input: RegisterPayoutAccountInput): Promise<SafePayoutAccount> {
    const user = await this.userStore.get(input.userId);
    if (!user) throw new PayoutAccountError('회원을 찾을 수 없습니다.');
    if (user.userType === 'CONSUMER') {
      throw new PayoutAccountError('정산 계좌는 업체 회원만 등록할 수 있습니다.');
    }

    // 정산·세금계산서에 쓰는 사업자번호는 가입 정보에서 가져온다.
    // 여기서 따로 입력받으면 두 값이 갈라져 세금계산서가 엉뚱한 사업자로 발행된다.
    const businessNumber = normalizeBusinessNumber(user.businessNumber ?? '');
    if (!isValidBusinessNumber(businessNumber)) {
      throw new PayoutAccountError(
        '가입 정보에 유효한 사업자등록번호가 없습니다. 업체 정보를 먼저 확인해 주세요.',
      );
    }

    const valid = validatePayoutAccountInput(input);
    if (!valid.ok) throw new PayoutAccountError(valid.error!);

    const account: PayoutAccount = {
      userId: input.userId,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber.replace(/\D/g, ''),
      holderName: input.holderName.trim(),
      businessNumber,
      // PG 실명조회를 붙이기 전까지는 항상 미확인이다. 확인된 척하지 않는다.
      verification: 'UNVERIFIED',
      updatedAt: new Date().toISOString(),
    };
    await this.save(account);
    return toSafePayoutAccount(account);
  }

  /**
   * 실명확인 결과 반영. PG 계좌 실명조회 연동 시 그 응답으로 호출한다.
   * ⚠️ 사유에 계좌번호가 섞이지 않도록 호출부가 코드/요약만 넘긴다.
   */
  async markVerification(
    userId: string,
    verification: 'VERIFIED' | 'FAILED',
    error?: string,
  ): Promise<SafePayoutAccount> {
    const account = await this.getRaw(userId);
    if (!account) throw new PayoutAccountError('정산 계좌를 찾을 수 없습니다.');
    const updated: PayoutAccount = {
      ...account,
      verification,
      verificationError: verification === 'FAILED' ? error : undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return toSafePayoutAccount(updated);
  }
}
