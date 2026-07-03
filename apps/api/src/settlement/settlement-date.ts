import { SETTLEMENT_DELAY_BUSINESS_DAYS, addBusinessDays } from '@dimol/shared';

/**
 * 처리완료일 기준 정산 지급일(D+1 영업일)을 계산한다.
 * 주말/공휴일에 걸리면 다음 영업일로 순연한다.
 *
 * - 지연 영업일 수는 @dimol/shared 의 SETTLEMENT_DELAY_BUSINESS_DAYS 단일 소스만 사용.
 * - 공휴일은 특일정보 API 등에서 받은 셋을 주입한다(미주입 시 주말만 순연).
 *
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 정산 주기.
 *   자동 커밋/머지 금지, 사람이 diff 검토 + 유닛 테스트 통과 후 반영.
 *
 * @param completedDate 처리완료일 'YYYY-MM-DD' (KST)
 * @param holidays 공휴일 셋('YYYY-MM-DD')
 */
export function calculateSettlementDate(
  completedDate: string,
  holidays: ReadonlySet<string> = new Set(),
): string {
  return addBusinessDays(completedDate, SETTLEMENT_DELAY_BUSINESS_DAYS, holidays);
}
