import type { ManualParityInput, ParityReport, ParitySample } from '@dimol/shared';
import { adminHeaders } from './admin';
import { api } from './http';

/**
 * 원격 vs 방문 견적 정합성(시범 측정) — 관리자 전용 API.
 *
 * 관리자 인증 헤더는 [[admin]] 의 adminHeaders 를 그대로 쓴다(로그인 세션 또는 공유 토큰).
 */

export interface ParityOverview {
  report: ParityReport;
  samples: ParitySample[];
}

export const adminGetEstimateParity = (adminToken: string) =>
  api<ParityOverview>('/admin/estimate-parity', { headers: adminHeaders(adminToken) });

/** 철거 견적에서 AUTO 표본을 다시 계산한다(멱등). */
export const adminRefreshEstimateParity = (adminToken: string) =>
  api<ParityOverview & { summary: { created: number; updated: number; removed: number } }>(
    '/admin/estimate-parity/refresh',
    { method: 'POST', headers: adminHeaders(adminToken), body: '{}' },
  );

/** 시범 현장 직원 입력. 검증은 서버와 같은 규칙(validateManualParityInput). */
export const adminAddParitySample = (adminToken: string, input: ManualParityInput) =>
  api<ParitySample>('/admin/estimate-parity/samples', {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify(input),
  });

export const adminSetParityActualTon = (adminToken: string, id: string, actualTon: number) =>
  api<ParitySample>(`/admin/estimate-parity/samples/${encodeURIComponent(id)}/actual-ton`, {
    method: 'PATCH',
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ actualTon }),
  });

export const adminDeleteParitySample = (adminToken: string, id: string) =>
  api<unknown>(`/admin/estimate-parity/samples/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(adminToken),
  });
