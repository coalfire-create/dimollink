import type { CancellationStage, SettlementPlan } from '@dimol/shared';
import { api } from './http';

/**
 * 결제 · 취소/환불 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 결제창 설정(공개값)
export interface PaymentConfig {
  storeId: string;
  channelKey: string;
  /** 정기결제(빌링키 발급) 채널. 없으면 정기결제 상품을 팔지 않는다. */
  billingChannelKey?: string | null;
  /** 'test' 면 실제 청구가 일어나지 않는다. */
  mode: 'test' | 'live';
}
/**
 * 결제창에 쓸 상점·채널을 서버에서 받는다.
 * 앱에 박아두면 PG(현재 KG이니시스)·채널을 바꿀 때마다 번들을 다시 빌드해야 한다.
 */
export const fetchPaymentConfig = () => api<PaymentConfig>('/payments/config');

// ── 결제 (선결제/취소)
export interface PrepayResult {
  plan: SettlementPlan;
  prepayment: { paymentId: string; [k: string]: unknown };
}
/**
 * 선결제 확정 — 앱 PortOne SDK 결제(paymentId)를 서버가 조회·검증한다.
 * 금액은 서버가 수락 견적에서 산출하고, 결제 실제 금액과 일치해야 통과(위변조 방지).
 * completedDate=처리완료 예정일(YYYY-MM-DD).
 */
export const prepay = (input: {
  matchRequestId: string;
  paymentId: string;
  completedDate: string;
  payMethod?: 'CARD' | 'VBANK';
}) => api<PrepayResult>('/payments/prepay', { method: 'POST', body: JSON.stringify(input) });

/** 취소/환불 — 결제자 본인만. stage 로 위약금 정책 결정. */
export const cancelPayment = (input: {
  paymentId: string;
  stage: CancellationStage;
  reason?: string;
}) =>
  api<{ breakdown: { refundAmount: number; penaltyAmount: number } }>('/payments/cancel', {
    method: 'POST',
    body: JSON.stringify(input),
  });
