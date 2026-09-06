import type { CollectionPersistence } from '../lib/json-collection.js';

export interface PaymentRecord {
  paymentId: string;
  matchRequestId: string;
  payerId: string;
  amount: number;
  status: 'PAID' | 'CANCELLED';
  createdAt: string;
}

export class PaymentStore {
  private readonly fallbackMap = new Map<string, PaymentRecord>();

  constructor(private readonly persistence?: CollectionPersistence<PaymentRecord>) {}

  private async getInner(paymentId: string): Promise<PaymentRecord | undefined> {
    if (this.persistence) return this.persistence.get(paymentId);
    return this.fallbackMap.get(paymentId);
  }

  private async saveInner(record: PaymentRecord): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(record);
    } else {
      this.fallbackMap.set(record.paymentId, record);
    }
  }

  async record(input: { paymentId: string; matchRequestId: string; payerId: string; amount: number }): Promise<PaymentRecord> {
    const payment: PaymentRecord = {
      paymentId: input.paymentId,
      matchRequestId: input.matchRequestId,
      payerId: input.payerId,
      amount: input.amount,
      status: 'PAID',
      createdAt: new Date().toISOString(),
    };
    await this.saveInner(payment);
    return payment;
  }

  async get(paymentId: string): Promise<PaymentRecord | undefined> {
    return this.getInner(paymentId);
  }

  async markCancelled(paymentId: string): Promise<void> {
    const p = await this.getInner(paymentId);
    if (!p) return;
    await this.saveInner({ ...p, status: 'CANCELLED' });
  }
}
