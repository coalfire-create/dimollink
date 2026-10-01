import {
  DEMOLITION_MEMBERSHIP_ID,
  passCoversDate,
  platformFeeRateFor,
  subscriptionCoversDate,
} from '@dimol/shared';
import type { PassStore } from './pass-store.js';
import { kstToday, type SubscriptionStore } from './store.js';

/**
 * 철거업체 멤버십 혜택 판정 — 우선 알림·수수료 인하·상단 노출이 모두 여기를 본다.
 *
 * 혜택 여부를 화면이나 라우트마다 따로 계산하면 "알림은 받는데 수수료는 7%" 같은
 * 어긋남이 생긴다. 기준은 하나다: **결제로 덮인 기간 안인가**.
 * 지금 판매는 30일 이용권(단건결제, [[PassStore]])이고, 정기결제 구독도 같은 혜택으로
 * 인정한다(정기결제를 다시 열 경우를 위해 남겨 둔다).
 */
export class MembershipService {
  constructor(
    private readonly subscriptions: SubscriptionStore,
    private readonly passes: PassStore,
  ) {}

  /** `date`(YYYY-MM-DD, KST)에 멤버십 혜택을 받는 회원인가. */
  async isMemberOn(userId: string, date = kstToday()): Promise<boolean> {
    const [subs, passes] = await Promise.all([
      this.subscriptions.listByUser(userId),
      this.passes.listByUser(userId),
    ]);
    return (
      passes.some((p) => p.productId === DEMOLITION_MEMBERSHIP_ID && passCoversDate(p, date)) ||
      subs.some((s) => s.productId === DEMOLITION_MEMBERSHIP_ID && subscriptionCoversDate(s, date))
    );
  }

  /** 오늘 혜택을 받는 회원 id 목록(중복 없음). 상단 노출·우선 알림 대상. */
  async memberIdsOn(date = kstToday()): Promise<string[]> {
    const [subs, passes] = await Promise.all([this.subscriptions.listAll(), this.passes.listAll()]);
    const ids = [
      ...passes
        .filter((p) => p.productId === DEMOLITION_MEMBERSHIP_ID && passCoversDate(p, date))
        .map((p) => p.userId),
      ...subs
        .filter((s) => s.productId === DEMOLITION_MEMBERSHIP_ID && subscriptionCoversDate(s, date))
        .map((s) => s.userId),
    ];
    return [...new Set(ids)];
  }

  /**
   * 정산에 적용할 수수료율. **처리완료일 기준**으로 판단한다 — 정산을 언제 실행하든
   * 같은 거래에는 같은 수수료가 붙어야 한다(실행이 하루 밀렸다고 수수료가 바뀌면 안 된다).
   */
  async feeRateFor(userId: string, completedDate: string): Promise<number> {
    return platformFeeRateFor({ member: await this.isMemberOn(userId, completedDate) });
  }
}
