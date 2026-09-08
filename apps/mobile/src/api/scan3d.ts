import type {
  BuildingLedgerInfo,
  Scan3DJob,
  ScanTarget,
} from '@dimol/shared';
import { api, ApiError } from './http';

/**
 * 3D 현장 스캔 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 3D 현장 스캔 ─────────────────────────────────────────────────────────────

/**
 * 스캔 영상 업로드 → 복원 잡 생성 → 완료까지 폴링.
 *
 * 영상은 API 를 거치지 않고 스토리지에 **직접** 올린다(최대 200MB — 서버로 흘리면
 * 메모리가 터진다). 복원은 20~40분 걸리므로 잡 id 로 진행 단계를 폴링한다.
 */
export interface ScanPresignResponse {
  scanId: string;
  key: string;
  uploadUrl: string;
  requiredHeaders: { 'Content-Type': string; 'Content-Length': string };
  expiresInSec: number;
}

export const presignScanVideo = (contentType: string, contentLength: number) =>
  api<ScanPresignResponse>('/scan3d/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType, contentLength }),
  });

export const createScanJob = (input: {
  videoKey: string;
  target: ScanTarget;
  building?: BuildingLedgerInfo;
  hasArPose?: boolean;
  /** 촬영 중 걸음수 — 복원 경로 길이와 대조해 실제 치수 배율을 얻는다. */
  steps?: number;
}) =>
  api<{ jobId: string }>('/scan3d/jobs', { method: 'POST', body: JSON.stringify(input) });

export const getScanJob = (jobId: string) => api<Scan3DJob>(`/scan3d/jobs/${jobId}`);

/**
 * 기준 물체 측정 결과로 배율만 다시 적용한다 — **복원은 다시 돌리지 않는다.**
 * 부피는 배율의 세제곱이라 원시 부피만 있으면 재계산이 공짜다(GPU 비용 0).
 */
export const rescaleScanJob = (jobId: string, realLengthM: number, measuredUnits: number) =>
  api<Scan3DJob>(`/scan3d/jobs/${jobId}/rescale`, {
    method: 'POST',
    body: JSON.stringify({ realLengthM, measuredUnits }),
  });

export const getScanSceneUrl = (key: string) =>
  api<{ key: string; viewUrl: string }>(`/scan3d/scene-url?key=${encodeURIComponent(key)}`);

/** 복원 폴링 간격(ms). 20~40분 걸리는 작업이라 촘촘히 물을 이유가 없다. */
export const SCAN_POLL_INTERVAL_MS = 5000;

/**
 * 영상 파일을 presigned URL 로 직접 업로드한다.
 * 서명에 Content-Type/Length 가 포함돼 있어 헤더가 다르면 스토리지가 거부한다.
 */
export async function uploadScanVideo(
  presigned: ScanPresignResponse,
  blob: Blob,
): Promise<void> {
  const res = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.requiredHeaders,
    body: blob,
  });
  if (!res.ok) throw new ApiError('영상 업로드에 실패했어요. 네트워크를 확인해 주세요.', res.status);
}
