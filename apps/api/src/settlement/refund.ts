import {
  CANCELLATION_PENALTY_RATE,
  type CancellationStage,
  type MatchStatus,
  type RefundBreakdown,
} from '@dimol/shared';

/**
 * 취소/환불 정책 계산 (CLAUDE.md 핵심 비즈니스 규칙).
 * - BEFORE_DISPATCH(배차 전): 전액 환불
 * - AFTER_DISPATCH(배차 후 ~ 작업 시작 전): 위약금 10% 공제 후 환불
 * - AFTER_WORK_START(반출/상차 등 작업 시작 후): 원칙적으로 취소 불가
 *
 * - 위약금율은 @dimol/shared 의 CANCELLATION_PENALTY_RATE 단일 소스만 사용(하드코딩 금지).
 * - 금액은 원 단위 정수. refundAmount + penaltyAmount == paidAmount 불변식을 항상 유지한다.
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 금액/수수료 계산.
 *   자동 커밋/머지 금지, 사람이 diff 검토 + 유닛 테스트 통과 후 반영.
 */

export interface RefundInput {
  /** 배출자 선결제 원금(원). */
  paidAmount: number;
  stage: CancellationStage;
}

/** 취소 불가 단계에서 취소를 실행하려 할 때 던지는 오류. */
export class CancellationNotAllowedError extends Error {
  constructor(readonly stage: CancellationStage) {
    super('작업 시작 후에는 원칙적으로 취소할 수 없습니다.');
    this.name = 'CancellationNotAllowedError';
  }
}

export function calculateRefund({ paidAmount, stage }: RefundInput): RefundBreakdown {
  if (!Number.isInteger(paidAmount) || paidAmount < 0) {
    throw new Error('선결제 금액은 0 이상의 정수여야 합니다.');
  }

  switch (stage) {
    case 'BEFORE_DISPATCH':
      // 배차 전 — 전액 환불.
      return { stage, cancellable: true, paidAmount, penaltyAmount: 0, refundAmount: paidAmount };

    case 'AFTER_DISPATCH': {
      // 배차 후 ~ 작업 시작 전 — 위약금 10% 공제.
      const penaltyAmount = Math.round(paidAmount * CANCELLATION_PENALTY_RATE);
      return {
        stage,
        cancellable: true,
        paidAmount,
        penaltyAmount,
        refundAmount: paidAmount - penaltyAmount,
      };
    }

    case 'AFTER_WORK_START':
      // 작업 시작 후 — 취소 불가(환불 없음).
      return { stage, cancellable: false, paidAmount, penaltyAmount: 0, refundAmount: 0 };

    default: {
      // 모든 단계를 처리했는지 컴파일 타임에 보장.
      const exhaustive: never = stage;
      throw new Error(`알 수 없는 취소 단계: ${String(exhaustive)}`);
    }
  }
}

/** 취소 실행 경로에서 사용 — 취소 불가 단계면 예외를 던진다(방어적). */
export function assertCancellable(breakdown: RefundBreakdown): void {
  if (!breakdown.cancellable) {
    throw new CancellationNotAllowedError(breakdown.stage);
  }
}

/** 취소 단계의 엄격함 순서 — 뒤로 갈수록 환불이 적다. */
const STAGE_SEVERITY: Record<CancellationStage, number> = {
  BEFORE_DISPATCH: 0,
  AFTER_DISPATCH: 1,
  AFTER_WORK_START: 2,
};

/**
 * 실제로 적용할 취소 단계 — 클라이언트가 보낸 단계와 요청 상태로 본 단계 중 **더 엄격한 쪽**.
 *
 * 예전에는 클라이언트가 보낸 stage 를 그대로 믿었다. 그러면 작업이 이미 시작된(IN_PROGRESS)
 * 건도 앱이 'BEFORE_DISPATCH' 를 보내면 전액 환불이 실행됐다. 요청 상태에는 "배차"를 나타내는
 * 단계가 따로 없으므로 서버가 확실히 아는 것만 강제한다: 작업 시작 이후 상태면 취소 불가.
 * 클라이언트가 더 엄격한 단계(AFTER_DISPATCH 등)를 보내면 그대로 따른다 — 낮출 수는 없다.
 */
export function effectiveCancellationStage(
  claimed: CancellationStage,
  requestStatus: MatchStatus | undefined,
): CancellationStage {
  const workStarted =
    requestStatus === 'IN_PROGRESS' || requestStatus === 'COMPLETED' || requestStatus === 'SETTLED';
  const derived: CancellationStage = workStarted ? 'AFTER_WORK_START' : 'BEFORE_DISPATCH';
  return STAGE_SEVERITY[derived] > STAGE_SEVERITY[claimed] ? derived : claimed;
}
