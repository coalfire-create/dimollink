import type { ServiceRequest } from '@dimol/shared';

/**
 * 목록에서 한 건을 **다른 건과 구분**하는 값들.
 *
 * 업체 홈 세 곳(철거·운반·처리장)이 같은 함수를 각자 복사해 두고 있었고,
 * 대시보드(이용내역)까지 같은 요약이 필요해져 화면 밖으로 꺼냈다.
 */

/**
 * 한 줄 요약 — 종류마다 "어디서 무슨 일인지"가 다른 필드에 있다.
 *
 * 철거는 현장 주소, 운반은 상차→하차 구간, 처리장 예약은 방문 일시가 핵심이다.
 * 목록에서 수락 여부(업체)나 어느 건인지(배출자)를 판단하는 첫 정보다.
 */
export function requestSubtitle(request: ServiceRequest): string {
  if (request.kind === 'DEMOLITION') return request.siteAddress;
  if (request.kind === 'TRANSPORT') return `${request.loadAddress} → ${request.unloadAddress}`;
  return new Date(request.visitAt).toLocaleString('ko-KR');
}

/**
 * 중량 표기 — **없으면 null**.
 *
 * 철거 요청은 현장 실사 전까지 물량이 잡히지 않아 `wasteTons` 가 0 이다. 그걸 그대로
 * 찍으면 목록의 모든 철거 건이 "0톤"으로 똑같아 보이고, 사용자는 값이 아니라
 * 화면이 고장 났다고 읽는다. 아직 모르는 값은 자리를 비우고 주소·날짜로 구분하게 한다.
 */
export function requestTons(request: ServiceRequest): string | null {
  return request.wasteTons > 0 ? `${request.wasteTons.toLocaleString('ko-KR')}톤` : null;
}
