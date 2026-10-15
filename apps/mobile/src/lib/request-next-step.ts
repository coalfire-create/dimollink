import type { ServiceRequest } from '@dimol/shared';

/**
 * 배출자가 이 요청에서 **지금 해야 할 일** 한 가지.
 *
 * 상태 이름("매칭완료")만 보여 주면 사용자는 그래서 뭘 하라는 건지 다시 찾아야 한다.
 * 홈 대시보드와 요청 상세가 같은 답을 내야 해서(한쪽은 "결제하기", 한쪽은 "기다리세요"면
 * 둘 중 하나를 믿지 않게 된다) 화면 밖 순수 함수로 둔다.
 *
 * 결제 금액은 서버 확정 금액(`agreedFee`) **전액**이다 — 선결제 규칙(CLAUDE.md)이라
 * 계약금·잔금으로 나누지 않는다. 서버도 포트원 결제 금액이 agreedFee 와 같은지 검증한다.
 */
export type NextStepAction = 'PAY' | 'VIEW_ESTIMATES' | 'TRACK' | 'REVIEW' | 'DETAIL';

export interface NextStep {
  /** 한 줄 제목 — 지금 상황. */
  headline: string;
  /** 제목 아래 설명 — 다음에 무슨 일이 일어나는지. */
  hint: string;
  action: NextStepAction;
  actionLabel: string;
  /** 사용자가 손을 써야 진행되는 단계인지(강조 표시용). */
  needsAttention: boolean;
}

export function requesterNextStep(request: ServiceRequest): NextStep {
  switch (request.status) {
    case 'REQUESTED':
      return request.kind === 'DEMOLITION'
        ? {
            headline: '업체 견적을 받고 있어요',
            hint: '견적이 도착하면 알림으로 알려 드려요. 금액·평점을 비교해 고르면 돼요.',
            action: 'VIEW_ESTIMATES',
            actionLabel: '받은 견적 보기',
            needsAttention: false,
          }
        : {
            headline: '업체를 찾고 있어요',
            hint: '업체가 수락하면 알림으로 알려 드려요.',
            action: 'DETAIL',
            actionLabel: '요청 내용 보기',
            needsAttention: false,
          };
    case 'MATCHED':
      return request.agreedFee !== undefined && request.agreedFee > 0
        ? {
            headline: '결제하면 일정이 확정돼요',
            hint: '배차 전에 취소하면 전액 환불돼요.',
            action: 'PAY',
            actionLabel: '결제하기',
            needsAttention: true,
          }
        : {
            headline: '업체가 금액을 정하고 있어요',
            hint: '금액이 확정되면 바로 결제할 수 있어요.',
            action: 'DETAIL',
            actionLabel: '진행 상태 보기',
            needsAttention: false,
          };
    case 'PAID':
      return request.kind === 'TRANSPORT'
        ? {
            headline: '차량 배차를 준비하고 있어요',
            hint: '출발하면 지도에서 차량 위치를 볼 수 있어요.',
            action: 'TRACK',
            actionLabel: '차량 위치 보기',
            needsAttention: false,
          }
        : {
            headline: '작업일을 기다리고 있어요',
            hint: '작업일에 업체가 현장에 나가요.',
            action: 'DETAIL',
            actionLabel: '진행 상태 보기',
            needsAttention: false,
          };
    case 'IN_PROGRESS':
      return request.kind === 'TRANSPORT'
        ? {
            headline: '운반 중이에요',
            hint: '지도에서 차량 위치를 실시간으로 볼 수 있어요.',
            action: 'TRACK',
            actionLabel: '차량 위치 보기',
            needsAttention: false,
          }
        : {
            headline: '현장 작업이 진행 중이에요',
            hint: '작업이 끝나면 알림으로 알려 드려요.',
            action: 'DETAIL',
            actionLabel: '진행 상태 보기',
            needsAttention: false,
          };
    case 'COMPLETED':
    case 'SETTLED':
      return {
        headline: '작업이 끝났어요',
        hint: '업체는 어땠나요? 후기가 다른 이웃의 선택을 도와요.',
        action: 'REVIEW',
        actionLabel: '후기 남기기',
        needsAttention: false,
      };
    case 'CANCELLED':
      return {
        headline: '취소된 요청이에요',
        hint: request.cancelReason
          ? `사유: ${request.cancelReason}`
          : '필요하면 다시 신청할 수 있어요.',
        action: 'DETAIL',
        actionLabel: '요청 내용 보기',
        needsAttention: false,
      };
  }
}

/** 지금 결제할 금액 — 결제할 차례가 아니면 null. 금액은 서버 확정 금액 전액이다. */
export function payableAmount(request: ServiceRequest): number | null {
  if (request.status !== 'MATCHED') return null;
  if (request.agreedFee === undefined || request.agreedFee <= 0) return null;
  return request.agreedFee;
}
