import { maskBusinessNumber, type PayoutParty } from '@dimol/shared';
import { env } from '../config/env.js';

/**
 * 포트원(PortOne) 지급대행 클라이언트 — 배출자 선결제 + 셀러별 정산 지급대행.
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 결제/정산 로직.
 *   자동 커밋/머지 금지. 사람이 diff 검토 + 포트원 테스트 모드로 검증 후 반영한다.
 * ⚠️ 운영(live) 키로 먼저 테스트하지 않는다. 기본 모드는 test이며, live 호출은
 *   PORTONE_ALLOW_LIVE=true 를 명시해야만 가능하다.
 * ⚠️ 엔드포인트/요청·응답 필드는 실제 포트원 지급대행 API(또는 @portone/server-sdk)
 *   규격에 맞춰 확정해야 한다. 아래 경로·매핑은 규격 확정 전 임시 가정이다.
 */

export type PortOneErrorCode =
  | 'CONFIG_MISSING' // apiSecret 미설정
  | 'LIVE_BLOCKED' // 테스트 검증 전 실거래 호출 차단
  | 'INVALID_AMOUNT' // 금액이 양의 정수가 아님
  | 'TIMEOUT'
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

export interface PortOneClientConfig {
  baseUrl: string;
  apiSecret?: string;
  storeId?: string;
  mode: 'test' | 'live';
  allowLive: boolean;
  timeoutMs: number;
}

/** 결제수단. CLAUDE.md: 계좌이체(가상계좌) 기본 노출 + 카드 병행. */
export type PayMethod = 'VIRTUAL_ACCOUNT' | 'CARD';

export interface PrepaymentRequest {
  matchRequestId: string;
  /** 선결제 총액(원, 운반비+처리비). */
  amount: number;
  /** 기본 가상계좌. 카드도 병행 지원. */
  payMethod?: PayMethod;
  customerName?: string;
}

export interface PrepaymentResult {
  paymentId: string;
  amount: number;
  method: PayMethod;
  status: string;
  environment: 'test' | 'live';
}

export interface PayoutRequest {
  /** 정산 단위 고유 멱등키(중복 지급 방지). */
  payoutId: string;
  party: PayoutParty;
  /** 지급액(원, 수수료 차감 후). */
  amount: number;
  businessNumber?: string;
}

export interface PayoutResult {
  payoutId: string;
  amount: number;
  status: string;
  environment: 'test' | 'live';
}

export interface CancelPaymentRequest {
  paymentId: string;
  /** 환불(취소) 금액. 원금 전액이면 전액취소, 일부면 부분취소. */
  amount: number;
  reason?: string;
}

export interface CancelPaymentResult {
  paymentId: string;
  cancelledAmount: number;
  status: string;
  environment: 'test' | 'live';
}

export interface TaxInvoiceRequest {
  /** 대응하는 정산 지급 멱등키(중복 발행 방지). */
  payoutId: string;
  /** 공급자(정산 받는 셀러: 운반업체/처리장) 사업자번호. */
  businessNumber: string;
  /** 공급가액(원, 지급액 기준). */
  amount: number;
  /** 품목명. */
  itemName?: string;
}

export interface TaxInvoiceResult {
  taxInvoiceId: string;
  status: string;
  environment: 'test' | 'live';
}

function assertPositiveInt(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PortOneError('INVALID_AMOUNT', `금액은 양의 정수여야 합니다: ${amount}`);
  }
}

export class PortOneClient {
  constructor(
    private readonly config: PortOneClientConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /**
   * 배출자 선결제 요청(가상계좌 기본 / 카드 병행). 성공 시 결제 식별자 반환.
   * 금액만 로그에 남기고 고객/계좌 등 식별정보는 남기지 않는다.
   */
  async requestPrepayment(req: PrepaymentRequest): Promise<PrepaymentResult> {
    assertPositiveInt(req.amount);
    const method: PayMethod = req.payMethod ?? 'VIRTUAL_ACCOUNT';
    const paymentId = `pay-${req.matchRequestId}-${Date.now()}`;

    // 엔드포인트/요청 스펙은 실제 포트원 API 규격에 맞춰 확정 필요.
    const data = await this.post(
      `/payments/${encodeURIComponent(paymentId)}/prepare`,
      {
        storeId: this.config.storeId,
        amount: req.amount,
        payMethod: method,
        orderName: `비움 매칭 ${req.matchRequestId}`,
      },
      `payment=${paymentId}`,
    );

    return {
      paymentId,
      amount: req.amount,
      method,
      status: typeof data.status === 'string' ? data.status : 'PENDING',
      environment: this.config.mode,
    };
  }

  /**
   * 셀러(운반업체/처리장) 지급대행 지급. payoutId를 멱등키로 사용해 중복 지급을 막는다.
   * 사업자번호(PII)는 로그에 마스킹 값만 남긴다.
   */
  async createPayout(req: PayoutRequest): Promise<PayoutResult> {
    assertPositiveInt(req.amount);

    const data = await this.post(
      '/payouts',
      {
        storeId: this.config.storeId,
        payoutId: req.payoutId,
        party: req.party,
        amount: req.amount,
        // 사업자번호는 페이로드로만 전송, 로그엔 남기지 않음.
        businessNumber: req.businessNumber,
      },
      `payout=${req.payoutId} (${req.businessNumber ? maskBusinessNumber(req.businessNumber) : '-'})`,
    );

    return {
      payoutId: req.payoutId,
      amount: req.amount,
      status: typeof data.status === 'string' ? data.status : 'REQUESTED',
      environment: this.config.mode,
    };
  }

  /**
   * 결제 취소/환불. 취소 정책상 환불액(=원금-위약금)만큼 부분/전액 취소한다.
   * 위약금은 플랫폼이 보유하므로 취소 금액은 환불액과 같다.
   */
  async cancelPayment(req: CancelPaymentRequest): Promise<CancelPaymentResult> {
    assertPositiveInt(req.amount);

    // 엔드포인트/요청 스펙은 실제 포트원 결제취소 API 규격에 맞춰 확정 필요.
    const data = await this.post(
      `/payments/${encodeURIComponent(req.paymentId)}/cancel`,
      { storeId: this.config.storeId, amount: req.amount, reason: req.reason },
      `payment=${req.paymentId}`,
    );

    return {
      paymentId: req.paymentId,
      cancelledAmount: req.amount,
      status: typeof data.status === 'string' ? data.status : 'CANCELLED',
      environment: this.config.mode,
    };
  }

  /**
   * 전자세금계산서 발행 — 정산 확정 시 셀러(운반업체/처리장) 공급분에 대해 발행한다.
   * payoutId 를 멱등키로 사용해 중복 발행을 막는다. 사업자번호(PII)는 마스킹 로그만 남긴다.
   * ⚠️ 엔드포인트/필드는 실제 포트원 전자세금계산서 API 규격에 맞춰 확정 필요(임시 가정).
   */
  async issueTaxInvoice(req: TaxInvoiceRequest): Promise<TaxInvoiceResult> {
    assertPositiveInt(req.amount);
    const taxInvoiceId = `tax-${req.payoutId}`;

    const data = await this.post(
      '/tax-invoices',
      {
        storeId: this.config.storeId,
        taxInvoiceId,
        businessNumber: req.businessNumber,
        supplyAmount: req.amount,
        itemName: req.itemName ?? '폐기물 운반·처리 용역',
      },
      `taxinvoice=${taxInvoiceId} (${maskBusinessNumber(req.businessNumber)})`,
    );

    return {
      taxInvoiceId,
      status: typeof data.status === 'string' ? data.status : 'ISSUED',
      environment: this.config.mode,
    };
  }

  /** 공통 POST: 실거래 가드 + 설정 가드 + 타임아웃 + 업스트림 오류 매핑. */
  private async post(
    path: string,
    body: unknown,
    logKey: string,
  ): Promise<Record<string, unknown>> {
    if (this.config.mode === 'live' && !this.config.allowLive) {
      throw new PortOneError(
        'LIVE_BLOCKED',
        '실거래(live) 포트원 호출이 차단되었습니다. 테스트 검증 완료 후 PORTONE_ALLOW_LIVE=true 로 전환하세요.',
      );
    }

    if (!this.config.apiSecret) {
      throw new PortOneError(
        'CONFIG_MISSING',
        '포트원 설정(PORTONE_API_SECRET)이 없습니다. apps/api/.env 를 확인하세요.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `PortOne ${this.config.apiSecret}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[portone] POST ${path} timeout (${logKey})`);
        throw new PortOneError('TIMEOUT', '포트원 응답이 시간 내 도착하지 않았습니다.');
      }
      console.warn(`[portone] POST ${path} network error (${logKey})`);
      throw new PortOneError('UPSTREAM_ERROR', '포트원 API 호출에 실패했습니다.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      console.warn(`[portone] POST ${path} upstream ${response.status} (${logKey})`);
      throw new PortOneError('UPSTREAM_ERROR', `포트원 API 오류(status=${response.status}).`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

/** 환경변수 기반 기본 클라이언트 팩토리. */
export function createPortOneClient(fetchFn: typeof fetch = fetch): PortOneClient {
  return new PortOneClient(
    {
      baseUrl: env.portone.baseUrl,
      apiSecret: env.portone.apiSecret,
      storeId: env.portone.storeId,
      mode: env.portone.mode,
      allowLive: env.portone.allowLive,
      timeoutMs: env.portone.timeoutMs,
    },
    fetchFn,
  );
}
