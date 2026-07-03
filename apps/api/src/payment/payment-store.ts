import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 결제 기록 저장소 — 선결제 시 결제ID ↔ 요청·결제자·금액을 남긴다.
 * 취소 시 결제자 본인 검증과 환불 기준금액(권위 있는 paidAmount) 확인에 쓴다.
 * 금액은 서버가 산출한 값이며 클라이언트 입력을 신뢰하지 않는다.
 */
export interface PaymentRecord {
  paymentId: string;
  matchRequestId: string;
  /** 결제자(배출자) 회원 id. */
  payerId: string;
  /** 실제 청구/결제 금액(원). */
  amount: number;
  status: 'PAID' | 'CANCELLED';
  createdAt: string;
}

export class PaymentStore {
  private readonly payments = new Map<string, PaymentRecord>();

  constructor(private readonly persistence?: CollectionPersistence<PaymentRecord>) {
    for (const p of persistence?.load() ?? []) this.payments.set(p.paymentId, p);
  }

  private persist(): void {
    this.persistence?.save([...this.payments.values()]);
  }

  record(input: { paymentId: string; matchRequestId: string; payerId: string; amount: number }): PaymentRecord {
    const payment: PaymentRecord = {
      paymentId: input.paymentId,
      matchRequestId: input.matchRequestId,
      payerId: input.payerId,
      amount: input.amount,
      status: 'PAID',
      createdAt: new Date().toISOString(),
    };
    this.payments.set(payment.paymentId, payment);
    this.persist();
    return payment;
  }

  get(paymentId: string): PaymentRecord | undefined {
    return this.payments.get(paymentId);
  }

  markCancelled(paymentId: string): void {
    const p = this.payments.get(paymentId);
    if (!p) return;
    this.payments.set(paymentId, { ...p, status: 'CANCELLED' });
    this.persist();
  }
}
