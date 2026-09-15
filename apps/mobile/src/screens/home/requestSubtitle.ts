import type { ServiceRequest } from '@dimol/shared';

/**
 * 일감 카드 한 줄 요약 — 종류마다 "어디서 무슨 일인지"가 다른 필드에 있다.
 *
 * 철거는 현장 주소, 운반은 상차→하차 구간, 처리장 예약은 방문 일시가 핵심이다.
 * 업체가 목록에서 수락 여부를 판단하는 첫 정보라 종류별로 다르게 뽑는다.
 *
 * 업체 홈 세 곳(철거·운반·처리장)이 같은 함수를 각자 복사해 두고 있었다.
 */
export function requestSubtitle(request: ServiceRequest): string {
  if (request.kind === 'DEMOLITION') return request.siteAddress;
  if (request.kind === 'TRANSPORT') return `${request.loadAddress} → ${request.unloadAddress}`;
  return new Date(request.visitAt).toLocaleString('ko-KR');
}
