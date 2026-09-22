import { PaymentClient, Webhook } from '@portone/server-sdk';
import { maskBusinessNumber, type PayoutParty } from '@dimol/shared';
import { env } from '../config/env.js';

/**
 * 포트원(PortOne) V2 서버 SDK 래퍼 — @portone/server-sdk 실연동.
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 결제/정산 로직.
 *   자동 커밋/머지 금지. 사람이 diff 검토 + 포트원 테스트 모드로 검증 후 반영한다.
 *
 * V2 결제 모델(중요):
 * - 결제 "생성"(가상계좌 발급·카드 승인)은 서버가 아니라 앱/브라우저 포트원 SDK가
 *   `requestPayment` 로 수행하고 paymentId 를 채번한다.
 * - 서버는 그 paymentId 를 `getPayment` 로 조회해 상태·금액을 검증(verifyPayment)하고,
 *   가상계좌 입금 완료는 웹훅(Transaction.Paid)으로 통지받아 확정한다.
 * - 취소/환불은 서버가 `cancelPayment` 로 수행한다.
 * 따라서 "서버가 결제를 만든다"는 개념은 없다(구 requestPrepayment 제거).
 */

export type PortOneErrorCode =
  | 'CONFIG_MISSING' // apiSecret/웹훅시크릿 미설정
  | 'LIVE_BLOCKED' // 테스트 검증 전 실거래 호출 차단
  | 'PAYMENT_NOT_FOUND' // 조회 결과 없음
  | 'PAYMENT_NOT_PAID' // 결제 상태가 완료(PAID)가 아님
  | 'AMOUNT_MISMATCH' // 결제 금액이 합의 금액과 불일치
  | 'WEBHOOK_INVALID' // 웹훅 서명 검증 실패
  | 'NOT_CONFIGURED' // 지급대행/세금계산서: 파트너정산(Platform)·B2B 미연동
  | 'UPSTREAM_ERROR';

export class PortOneError extends Error {
  constructor(
    readonly code: PortOneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PortOneError';
  }
}

/** 결제수단. CLAUDE.md: 계좌이체(가상계좌) 기본 노출 + 카드 병행. */
export type PayMethod = 'VIRTUAL_ACCOUNT' | 'CARD';

/** 서버가 검증한 결제 결과(우리 도메인 형태로 정규화). */
export interface VerifiedPayment {
  paymentId: string;
  /** 포트원이 확인한 실제 결제 총액(원). */
  amount: number;
  /** 포트원 결제 상태(PAID / VIRTUAL_ACCOUNT_ISSUED 등). */
  status: string;
  /** 결제 완료 여부(PAID). 가상계좌 발급만 된 상태면 false(입금 대기). */
  paid: boolean;
}

export interface CancelPaymentResult {
  paymentId: string;
  cancelledAmount: number;
  status: string;
}

// ── 정산 지급대행/세금계산서 결과 타입(파트너정산 연동 시 사용). 현재는 미연동.
export interface PayoutResult {
  payoutId: string;
  amount: number;
  status: string;
}
export interface TaxInvoiceResult {
  taxInvoiceId: string;
  status: string;
}

/**
 * SDK PaymentClient 중 우리가 쓰는 부분만 추린 인터페이스(주입식 — 테스트에서 대체).
 * 실제 구현은 @portone/server-sdk 의 PaymentClient 를 어댑트한다.
 */
export interface SdkPaymentClient {
  getPayment(options: {
    paymentId: string;
  }): Promise<{ status: string; amount?: { total: number } }>;
  cancelPayment(options: { paymentId: string; amount?: number; reason: string }): Promise<unknown>;
  /** 빌링키 결제(정기결제). 카드정보는 PG 가 들고 있고 우리는 키로만 청구한다. */
  payWithBillingKey?(options: {
    paymentId: string;
    billingKey: string;
    orderName: string;
    customer?: { id?: string };
    amount: { total: number };
    currency: string;
  }): Promise<{ payment?: { status?: string; amount?: { total?: number } } }>;
}

export interface PortOneClientConfig {
  apiSecret?: string;
  storeId?: string;
  baseUrl: string;
  mode: 'test' | 'live';
  allowLive: boolean;
  webhookSecret?: string;
}

/** 완료로 간주하는 결제 상태(가상계좌 발급만 된 상태는 입금 대기이므로 제외). */
const PAID_STATUS = 'PAID';

export class PortOneClient {
  private readonly payment?: SdkPaymentClient;

  constructor(
    private readonly config: PortOneClientConfig,
    /** 테스트에서 SDK 대신 주입. 미주입 시 설정이 있으면 실제 SDK PaymentClient 를 만든다. */
    paymentClient?: SdkPaymentClient,
  ) {
    if (paymentClient) {
      this.payment = paymentClient;
    } else if (config.apiSecret) {
      // 실제 포트원 V2 SDK. Payment 응답은 상태별 유니온이라 경계에서 최소 형태로 어댑트한다.
      this.payment = PaymentClient({
        secret: config.apiSecret,
        baseUrl: config.baseUrl,
        ...(config.storeId ? { storeId: config.storeId } : {}),
      }) as unknown as SdkPaymentClient;
    }
  }

  /**
   * 미연동(모의 응답) 기능 가드.
   *
   * 지급대행·전자세금계산서는 아직 포트원 파트너정산(Platform)·B2B 에 붙어 있지 않고
   * 성공한 척하는 값을 돌려준다. 테스트 모드에서는 흐름 확인용으로 쓸모가 있지만,
   * **실거래(live) 에서 그대로 성공을 반환하면 돈이 나가지 않았는데 정산·발행이 끝난 것으로
   * 기록된다.** 그 조용한 거짓말이 대사(對査)를 깨뜨리므로 live 에서는 막는다.
   */
  private assertMockAllowed(feature: string): void {
    if (this.config.mode === 'live') {
      throw new PortOneError(
        'NOT_CONFIGURED',
        `${feature}이(가) 아직 포트원에 연동되지 않았습니다. 실거래에서는 모의 응답을 반환하지 않습니다.`,
      );
    }
  }

  /** 실거래·설정 가드. 각 API 호출 진입 시 확인한다. */
  private ensureReady(): SdkPaymentClient {
    if (this.config.mode === 'live' && !this.config.allowLive) {
      throw new PortOneError(
        'LIVE_BLOCKED',
        '실거래(live) 포트원 호출이 차단되었습니다. 테스트 검증 완료 후 PORTONE_ALLOW_LIVE=true 로 전환하세요.',
      );
    }
    if (!this.payment) {
      throw new PortOneError(
        'CONFIG_MISSING',
        '포트원 설정(PORTONE_API_SECRET)이 없습니다. apps/api/.env 를 확인하세요.',
      );
    }
    return this.payment;
  }

  /**
   * 앱 SDK 가 만든 결제(paymentId)를 서버가 검증한다.
   * 금액 권위: 포트원이 확인한 실제 결제 총액이 합의 금액(expectedAmount)과 일치해야 한다.
   * 결제 완료(PAID)면 paid=true, 가상계좌 발급만 된 상태면 paid=false(입금은 웹훅으로 확정).
   */
  async verifyPayment(input: {
    paymentId: string;
    expectedAmount: number;
  }): Promise<VerifiedPayment> {
    const client = this.ensureReady();

    let payment: { status: string; amount?: { total: number } };
    try {
      payment = await client.getPayment({ paymentId: input.paymentId });
    } catch (err) {
      throw mapSdkError(err, `결제 조회 실패(paymentId=${input.paymentId})`);
    }

    const status = typeof payment.status === 'string' ? payment.status : 'UNKNOWN';
    const total = payment.amount?.total;
    if (typeof total !== 'number') {
      throw new PortOneError('PAYMENT_NOT_FOUND', '결제 정보를 확인할 수 없습니다.');
    }
    if (total !== input.expectedAmount) {
      // 위·변조 방지: 클라이언트가 임의 금액으로 결제했더라도 서버 합의금액과 다르면 거부.
      throw new PortOneError(
        'AMOUNT_MISMATCH',
        `결제 금액이 합의 금액과 다릅니다(결제 ${total} ≠ 합의 ${input.expectedAmount}).`,
      );
    }

    return { paymentId: input.paymentId, amount: total, status, paid: status === PAID_STATUS };
  }

  /**
   * 빌링키로 결제한다(월 정기결제).
   *
   * 빌링키는 정기결제창에서 발급받아 저장해 둔 값이다 — 카드번호가 아니라 PG 참조값이고,
   * 우리 DB 에는 이 값만 있다. 실패는 예외로 던지고 호출부(스케줄러)가 구독 상태를 바꾼다.
   */
  async payWithBillingKey(input: {
    paymentId: string;
    billingKey: string;
    orderName: string;
    amount: number;
    customerId?: string;
  }): Promise<{ paymentId: string; amount: number; paid: boolean }> {
    const client = this.ensureReady();
    if (!client.payWithBillingKey) {
      throw new PortOneError('CONFIG_MISSING', '정기결제(빌링키) 연동이 준비되지 않았습니다.');
    }
    let res: { payment?: { status?: string; amount?: { total?: number } } };
    try {
      res = await client.payWithBillingKey({
        paymentId: input.paymentId,
        billingKey: input.billingKey,
        orderName: input.orderName,
        amount: { total: input.amount },
        currency: 'KRW',
        ...(input.customerId ? { customer: { id: input.customerId } } : {}),
      });
    } catch (err) {
      throw mapSdkError(err, `정기결제 실패(paymentId=${input.paymentId})`);
    }
    const status = res.payment?.status ?? 'UNKNOWN';
    const total = res.payment?.amount?.total ?? 0;
    if (total !== input.amount) {
      throw new PortOneError(
        'AMOUNT_MISMATCH',
        `정기결제 금액이 상품가와 다릅니다(결제 ${total} ≠ 상품 ${input.amount}).`,
      );
    }
    return { paymentId: input.paymentId, amount: total, paid: status === PAID_STATUS };
  }

  /**
   * 결제 취소/환불(부분/전액). 취소 정책상 환불액만큼 취소하며 위약금은 플랫폼이 보유한다.
   * reason 은 포트원 V2 필수 값이다.
   */
  async cancelPayment(input: {
    paymentId: string;
    amount: number;
    reason?: string;
  }): Promise<CancelPaymentResult> {
    const client = this.ensureReady();
    assertPositiveInt(input.amount);
    try {
      await client.cancelPayment({
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason?.trim() || '고객 요청 취소',
      });
    } catch (err) {
      throw mapSdkError(err, `결제 취소 실패(paymentId=${input.paymentId})`);
    }
    return { paymentId: input.paymentId, cancelledAmount: input.amount, status: 'CANCELLED' };
  }

  /**
   * 포트원 웹훅 서명 검증. 가상계좌 입금 완료(Transaction.Paid) 등을 신뢰 가능하게 수신한다.
   * payload 는 원본 문자열(파싱 전), headers 는 webhook-id/-signature/-timestamp 포함.
   */
  async verifyWebhook(
    payload: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<Awaited<ReturnType<typeof Webhook.verify>>> {
    if (!this.config.webhookSecret) {
      throw new PortOneError(
        'CONFIG_MISSING',
        '포트원 웹훅 시크릿(PORTONE_WEBHOOK_SECRET)이 없습니다.',
      );
    }
    try {
      return await Webhook.verify(this.config.webhookSecret, payload, headers);
    } catch (err) {
      throw new PortOneError(
        'WEBHOOK_INVALID',
        `웹훅 검증 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      );
    }
  }

  /**
   * 셀러 지급대행. 포트원 파트너정산(Platform) 상품 연동이 필요하다.
   * platform.payout / platform.partnerSettlement 로 별도 구현해야 하며, 파트너 등록·정산정책이
   * 선행돼야 한다. 현재는 미연동 상태를 명시적으로 알린다(임의 지급 방지).
   */
  async createPayout(req: {
    payoutId: string;
    party: PayoutParty;
    amount: number;
    businessNumber?: string;
  }): Promise<PayoutResult> {
    assertPositiveInt(req.amount);
    this.assertMockAllowed('지급대행(파트너정산)');
    console.warn(
      `[portone] payout 요청 처리 완료 (모의 응답) payout=${req.payoutId} (${req.businessNumber ? maskBusinessNumber(req.businessNumber) : '-'})`,
    );
    // 실제 연동 시 PortOne 파트너정산 API 호출
    return {
      payoutId: req.payoutId,
      amount: req.amount,
      status: 'SCHEDULED',
    };
  }

  /** 전자세금계산서 발행 — 포트원 B2B(전자세금계산서) 상품 연동 필요. 현재 모의 응답. */
  async issueTaxInvoice(req: {
    payoutId: string;
    businessNumber: string;
    amount: number;
  }): Promise<TaxInvoiceResult> {
    assertPositiveInt(req.amount);
    this.assertMockAllowed('전자세금계산서(B2B)');
    console.warn(`[portone] 세금계산서 발행 요청 처리 완료 (모의 응답) (${maskBusinessNumber(req.businessNumber)})`);
    // 실제 연동 시 PortOne B2B API 호출
    return {
      taxInvoiceId: `tax-${req.payoutId}`,
      status: 'ISSUED',
    };
  }
}

function assertPositiveInt(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PortOneError('AMOUNT_MISMATCH', `금액은 양의 정수여야 합니다: ${amount}`);
  }
}

/** SDK 에러를 우리 PortOneError 로 정규화. data.type 이 있으면 참고해 코드를 맞춘다. */
function mapSdkError(err: unknown, fallbackMsg: string): PortOneError {
  if (err instanceof PortOneError) return err;
  const type = (err as { data?: { type?: string } })?.data?.type;
  if (type === 'PAYMENT_NOT_FOUND') {
    return new PortOneError('PAYMENT_NOT_FOUND', '결제 건을 찾을 수 없습니다.');
  }
  console.warn(`[portone] SDK 오류: ${fallbackMsg}`, type ?? (err instanceof Error ? err.message : err));
  return new PortOneError('UPSTREAM_ERROR', '포트원 API 호출에 실패했습니다.');
}

/** 환경변수 기반 기본 클라이언트 팩토리. */
export function createPortOneClient(paymentClient?: SdkPaymentClient): PortOneClient {
  return new PortOneClient(
    {
      apiSecret: env.portone.apiSecret,
      storeId: env.portone.storeId,
      baseUrl: env.portone.baseUrl,
      mode: env.portone.mode,
      allowLive: env.portone.allowLive,
      webhookSecret: env.portone.webhookSecret,
    },
    paymentClient,
  );
}
