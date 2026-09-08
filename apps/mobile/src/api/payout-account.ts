import type { SafePayoutAccount } from '@dimol/shared';
import { api } from './http';

/**
 * 정산 계좌 API — 업체가 돈을 받을 곳.
 *
 * 응답에는 **마스킹된 계좌번호**만 온다(서버가 보장). 원본은 앱에 내려오지 않으므로
 * 수정할 때는 계좌번호를 다시 입력받아야 한다.
 */

export const listBanks = () => api<{ code: string; name: string }[]>('/payout-accounts/banks');

/** 내 정산 계좌. 미등록이면 null(오류가 아니다). */
export const getMyPayoutAccount = () => api<SafePayoutAccount | null>('/payout-accounts/me');

export const savePayoutAccount = (input: {
  bankCode: string;
  accountNumber: string;
  holderName: string;
}) =>
  api<SafePayoutAccount>('/payout-accounts/me', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
