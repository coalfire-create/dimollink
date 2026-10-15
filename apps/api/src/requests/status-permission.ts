import type { MatchStatus, ServiceRequest } from '@dimol/shared';

/**
 * 참여자(배출자·매칭 업체)가 `PATCH /requests/:id/status` 로 바꿀 수 있는 상태 — 누가 무엇을.
 *
 * 예전에는 참여자이기만 하면 전이 규칙이 허용하는 어느 상태로든 바꿀 수 있었다. 그래서
 *  - 업체가 결제 없이 MATCHED → PAID 로 바꿔 작업·정산을 진행할 수 있었고,
 *  - 결제한 배출자가 일반 "요청 취소"를 누르면 요청만 CANCELLED 가 되고 환불은 안 돼
 *    돈이 묶였다(환불은 `/payments/cancel` 로만 실행된다).
 *
 * 이 경로로 바꿀 수 있는 건 세 가지뿐이다. 나머지(MATCHED·PAID·SETTLED)는 수락·결제·정산
 * 흐름이 각자 검증하고 바꾸며, 관리자 개입은 `/admin/requests/:id/status` 가 따로 맡는다.
 */
export type StatusChangeDenial =
  | { httpStatus: 403; code: 'NOT_ALLOWED_FOR_ROLE'; error: string }
  | { httpStatus: 409; code: 'USE_REFUND'; error: string };

export function checkParticipantStatusChange(
  request: ServiceRequest,
  userId: string,
  next: MatchStatus,
): StatusChangeDenial | null {
  const isProvider = request.matchedProviderId === userId;

  if (next === 'CANCELLED') {
    // 이미 돈이 들어온 건은 환불과 함께 취소해야 한다 — 상태만 바꾸면 결제가 그대로 남는다.
    if (request.status === 'PAID') {
      return {
        httpStatus: 409,
        code: 'USE_REFUND',
        error: '결제가 끝난 요청은 "취소하고 환불받기"로 취소해 주세요.',
      };
    }
    return null;
  }

  // 작업 시작·완료는 현장에 나가는 매칭 업체만 표시한다.
  if (next === 'IN_PROGRESS' || next === 'COMPLETED') {
    return isProvider
      ? null
      : {
          httpStatus: 403,
          code: 'NOT_ALLOWED_FOR_ROLE',
          error: '작업 시작·완료는 매칭된 업체만 바꿀 수 있어요.',
        };
  }

  return {
    httpStatus: 403,
    code: 'NOT_ALLOWED_FOR_ROLE',
    error: '이 상태는 여기서 바꿀 수 없어요.',
  };
}
