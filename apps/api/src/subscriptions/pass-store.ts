import { randomUUID } from 'node:crypto';
import { nextPassWindow, type MembershipPass } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import { kstToday } from './store.js';

/**
 * 기간제 이용권 저장소 — 단건결제로 산 혜택 기간.
 *
 * 정기결제와 달리 결제수단(빌링키)을 보관하지 않는다. 결제가 확인되면 기간 하나를 기록할
 * 뿐이고, 기간이 끝나면 혜택도 끝난다. 혜택 판정은 [[MembershipService]] 가 한다.
 */
export class PassStore {
  private readonly fallbackMap = new Map<string, MembershipPass>();

  constructor(private readonly persistence?: CollectionPersistence<MembershipPass>) {}

  async listAll(): Promise<MembershipPass[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  async listByUser(userId: string): Promise<MembershipPass[]> {
    if (this.persistence?.listBy) return this.persistence.listBy({ userId });
    return (await this.listAll()).filter((p) => p.userId === userId);
  }

  async get(id: string): Promise<MembershipPass | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  /** 환불 처리 — 기록은 지우지 않는다(같은 결제로 이용권을 다시 받지 못하게 막는 키라서). */
  async markRefunded(
    id: string,
    refund: { refundedAt: string; refundedAmount: number },
  ): Promise<MembershipPass> {
    const pass = await this.get(id);
    if (!pass) throw new Error(`이용권이 없습니다(id=${id}).`);
    const refunded: MembershipPass = { ...pass, ...refund };
    if (this.persistence) await this.persistence.save(refunded);
    else this.fallbackMap.set(id, refunded);
    return refunded;
  }

  async findByPaymentId(paymentId: string): Promise<MembershipPass | undefined> {
    return (await this.listAll()).find((p) => p.paymentId === paymentId);
  }

  /**
   * 결제가 확인된 뒤 이용권을 만든다.
   *
   * **같은 결제로 두 번 만들지 않는다.** 앱이 검증 요청을 재시도하거나 결제 id 를
   * 재사용해도 기간이 늘어나면 안 된다 — 이미 있으면 그 이용권을 그대로 돌려준다.
   * 이용 중에 다시 사면 남은 기간 뒤로 이어 붙인다([[nextPassWindow]]).
   */
  async grant(input: {
    userId: string;
    productId: string;
    paymentId: string;
    amount: number;
    days: number;
    today?: string;
  }): Promise<MembershipPass> {
    const existing = await this.findByPaymentId(input.paymentId);
    if (existing) return existing;

    const mine = (await this.listByUser(input.userId)).filter(
      (p) => p.productId === input.productId,
    );
    const window = nextPassWindow(mine, input.today ?? kstToday(), input.days);
    const pass: MembershipPass = {
      id: randomUUID(),
      userId: input.userId,
      productId: input.productId,
      paymentId: input.paymentId,
      ...window,
      amount: input.amount,
      createdAt: new Date().toISOString(),
    };
    if (this.persistence) await this.persistence.save(pass);
    else this.fallbackMap.set(pass.id, pass);
    return pass;
  }
}
