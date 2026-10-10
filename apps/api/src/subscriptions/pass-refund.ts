import {
  PASS_REFUND_BLOCK_MESSAGES,
  passRefundBlock,
  type MembershipPass,
  type PassRefundBlock,
} from '@dimol/shared';
import type { PortOneClient } from '../payment/portone-client.js';
import type { PassStore } from './pass-store.js';

/**
 * 이용권에서 혜택을 받았는가 — `since`(ISO) 이후 기록으로 판단한다.
 * 알림·정산 저장소를 직접 알지 않도록 판단 함수만 주입받는다(배선은 app.ts).
 */
export interface PassBenefitUsage {
  usedSince(userId: string, since: string): Promise<boolean>;
}

export class PassRefundError extends Error {
  constructor(
    readonly code: PassRefundBlock | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PassRefundError';
  }
}

/** 이용권 시작일 0시(KST)를 ISO(UTC)로. 이어 산 이용권은 시작일 전에는 혜택을 줄 수 없다. */
function startOfPassIso(pass: MembershipPass): string {
  return new Date(`${pass.startDate}T00:00:00+09:00`).toISOString();
}

/**
 * 이용권 환불 — 환불 정책([[SALES_PRODUCTS]] refundPolicy)을 서버에서 지키는 곳.
 *
 * 순서가 중요하다: **PG 취소가 성공한 뒤에만** 이용권을 환불 처리한다. 반대로 하면
 * 취소가 실패했을 때 돈은 그대로 빠져나갔는데 혜택만 사라진다. PG 취소는 성공했는데
 * 저장이 실패하면 혜택이 남지만, 그 경우 다시 요청하면 PG 가 "이미 취소됨"으로 거절하므로
 * 이중 환불은 생기지 않는다.
 */
export class PassRefundService {
  constructor(
    private readonly passes: PassStore,
    private readonly portone: Pick<PortOneClient, 'cancelPayment'>,
    private readonly usage: PassBenefitUsage,
  ) {}

  async refund(passId: string, userId: string, now = new Date()): Promise<MembershipPass> {
    const pass = await this.passes.get(passId);
    // 남의 이용권은 "없다"고 답한다 — 존재 여부도 알려주지 않는다.
    if (!pass || pass.userId !== userId) {
      throw new PassRefundError('NOT_FOUND', '이용권을 찾을 수 없습니다.');
    }

    const mine = await this.passes.listByUser(userId);
    const newerPassExists = mine.some(
      (p) => p.id !== pass.id && p.productId === pass.productId && !p.refundedAt && p.startDate > pass.startDate,
    );
    const since = [pass.createdAt, startOfPassIso(pass)].sort().pop()!;
    const block = passRefundBlock(pass, {
      now,
      newerPassExists,
      // 앞의 검사에서 이미 막히면 저장소를 더 볼 필요가 없다.
      benefitUsed:
        pass.refundedAt || newerPassExists ? false : await this.usage.usedSince(userId, since),
    });
    if (block) throw new PassRefundError(block, PASS_REFUND_BLOCK_MESSAGES[block]);

    await this.portone.cancelPayment({
      paymentId: pass.paymentId,
      amount: pass.amount,
      reason: '이용권 환불(혜택 미사용, 환불 기간 내)',
    });
    return this.passes.markRefunded(pass.id, {
      refundedAt: now.toISOString(),
      refundedAmount: pass.amount,
    });
  }
}
