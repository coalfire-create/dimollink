import { randomUUID } from 'node:crypto';
import {
  addOneMonth,
  findSalesProduct,
  isBillingDue,
  type SalesProduct,
  type Subscription,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 월 정기결제 구독 저장소.
 *
 * ⚠️ 레코드에 **빌링키**가 들어 있다. 카드번호는 아니지만 이 값이면 결제를 일으킬 수
 * 있으므로, 응답으로 내보낼 때는 반드시 `toSafeSubscription` 을 거치고 로그에도 찍지
 * 않는다(CLAUDE.md 민감정보 규칙과 같은 취급).
 */

export class SubscriptionError extends Error {}

/** 'YYYY-MM-DD' (KST). 결제일 판정은 한국 날짜 기준이다. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class SubscriptionStore {
  private readonly fallbackMap = new Map<string, Subscription>();

  constructor(
    private readonly persistence?: CollectionPersistence<Subscription>,
    /** 상품 조회. 기본은 판매 카탈로그 — 테스트가 고정 정기결제 상품을 넣을 때만 바꾼다. */
    private readonly findProduct: (id: string) => SalesProduct | undefined = findSalesProduct,
  ) {}

  private async listInner(): Promise<Subscription[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async save(sub: Subscription): Promise<void> {
    if (this.persistence) await this.persistence.save(sub);
    else this.fallbackMap.set(sub.id, sub);
  }

  async get(id: string): Promise<Subscription | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  async listByUser(userId: string): Promise<Subscription[]> {
    return (await this.listInner()).filter((s) => s.userId === userId);
  }

  /** 전체 구독. 멤버십 혜택 대상 집계([[MembershipService]])가 쓴다. */
  async listAll(): Promise<Subscription[]> {
    return this.listInner();
  }

  /** 오늘 결제해야 하는 구독들. 스케줄러가 쓴다. */
  async listDue(today = kstToday()): Promise<Subscription[]> {
    return (await this.listInner()).filter((s) => isBillingDue(s, today));
  }

  /**
   * 정기결제창에서 빌링키를 받은 뒤 구독을 만든다.
   *
   * 첫 결제는 여기서 일으키지 않는다 — 구독 경로(`POST /products/:id/subscribe`)가 첫 달을
   * 승인받은 뒤에만 이걸 부르고, 스케줄러는 다음 결제일(한 달 뒤)부터 청구한다.
   * 두 곳에서 결제하면 이중청구가 된다.
   */
  async create(input: {
    userId: string;
    productId: string;
    billingKey: string;
    /** 첫 결제일(YYYY-MM-DD). 기본은 오늘. */
    startDate?: string;
  }): Promise<Subscription> {
    const product = this.findProduct(input.productId);
    if (!product || product.billingType !== 'MONTHLY_SUBSCRIPTION') {
      throw new SubscriptionError('정기결제 상품이 아닙니다.');
    }
    if (!input.billingKey.trim()) {
      throw new SubscriptionError('빌링키가 필요합니다.');
    }

    // 같은 상품을 두 번 구독하면 매달 두 번 청구된다.
    const active = (await this.listByUser(input.userId)).find(
      (s) => s.productId === input.productId && s.status === 'ACTIVE',
    );
    if (active) throw new SubscriptionError('이미 구독 중인 상품입니다.');

    const start = input.startDate ?? kstToday();
    const sub: Subscription = {
      id: randomUUID(),
      userId: input.userId,
      productId: input.productId,
      status: 'ACTIVE',
      billingKey: input.billingKey.trim(),
      nextBillingDate: addOneMonth(start),
      currentPeriodEnd: addOneMonth(start),
      startedAt: new Date().toISOString(),
    };
    await this.save(sub);
    return sub;
  }

  /**
   * 해지 — 다음 결제부터 청구하지 않는다. **이미 결제한 기간은 끝까지 쓴다.**
   * 즉시 끊으면 이미 낸 돈만큼을 못 쓰게 되어 환불 분쟁이 된다.
   */
  async cancel(id: string, userId: string): Promise<Subscription> {
    const sub = await this.get(id);
    if (!sub) throw new SubscriptionError('구독을 찾을 수 없습니다.');
    if (sub.userId !== userId) throw new SubscriptionError('본인 구독만 해지할 수 있습니다.');
    if (sub.status === 'CANCELLED') return sub;

    const cancelled: Subscription = {
      ...sub,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
    };
    await this.save(cancelled);
    return cancelled;
  }

  /** 결제 성공 — 다음 달로 넘긴다. */
  async markCharged(id: string): Promise<Subscription | undefined> {
    const sub = await this.get(id);
    if (!sub) return undefined;
    const next = addOneMonth(sub.nextBillingDate);
    const updated: Subscription = {
      ...sub,
      status: 'ACTIVE',
      nextBillingDate: next,
      currentPeriodEnd: next,
      lastError: undefined,
    };
    await this.save(updated);
    return updated;
  }

  /**
   * 결제 실패 — 상태만 바꾸고 결제일은 그대로 둔다. 다음 스케줄러 주기에 다시 시도한다.
   * ⚠️ 사유에 카드 정보가 섞이지 않도록 호출부가 코드/요약만 넘긴다.
   */
  async markFailed(id: string, reason: string): Promise<Subscription | undefined> {
    const sub = await this.get(id);
    if (!sub) return undefined;
    const updated: Subscription = { ...sub, status: 'PAYMENT_FAILED', lastError: reason };
    await this.save(updated);
    return updated;
  }
}
