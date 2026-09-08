import type {
  BuildingLedgerInfo,
  SiteAnalysis,
  SiteCaptureSlotId,
  VolumeEstimate,
  WasteItem,
} from '@dimol/shared';
import { api, ApiError } from './http';

/**
 * 현장 사진 AI 분석 · 물량 추정 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 현장 사진 AI 분석 (Phase 6): 소재 식별 + 철거 공정 안내
/** 분석에 보낼 한 장의 사진. 여러 각도로 여러 장을 보내면 AI가 종합 분석한다. */
export interface AnalyzeImage {
  imageBase64: string;
  mimeType?: string;
  /** 가이드 촬영 슬롯(정면벽·천장·바닥 등) — 부위별 사전확률·결측 선언에 쓰인다. */
  slotId?: SiteCaptureSlotId;
  /** 촬영 시점 품질 미달 사유(흐림·암전·과노출). 서버가 결측과 같은 급으로 다룬다. */
  qualityWarnings?: string[];
}
export interface AnalyzeSiteInput {
  imageBase64?: string;
  mimeType?: string;
  images?: AnalyzeImage[];
  note?: string;
  buildingStructure?: string;
  /** 현장 주소로 미리 조회한 건축물대장 정보 — 분석 정확도를 올리는 사전 사실. */
  building?: BuildingLedgerInfo;
  siteAddress?: string;
}
// POST /api/site-analysis/analyze
// Returns { jobId } and polls /api/site-analysis/jobs/:id
export const analyzeSite = async (input: AnalyzeSiteInput): Promise<SiteAnalysis> => {
  const { jobId } = await api<{ jobId: string }>('/site-analysis/analyze', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const job = await api<{ status: string; result?: SiteAnalysis; error?: string }>(
          `/site-analysis/jobs/${jobId}`
        );
        if (job.status === 'COMPLETED' && job.result) {
          resolve(job.result);
        } else if (job.status === 'FAILED') {
          reject(new ApiError(job.error || '분석 실패', 500));
        } else {
          setTimeout(poll, 2000); // Poll every 2 seconds
        }
      } catch (err) {
        reject(err);
      }
    };
    poll();
  });
};

/** 사진 → 소재 식별 + (연면적 있으면) 총 중량 추정 → 요청서 소재별 항목(wasteItems) 자동 변환. */
export interface PhotoWasteItemsResult {
  analysis: SiteAnalysis;
  wasteItems: WasteItem[];
}
export const analyzeSiteWasteItems = (input: {
  imageBase64?: string;
  mimeType?: string;
  images?: AnalyzeImage[];
  floorAreaM2?: number;
  buildingStructure?: string;
  /** 현장 주소로 미리 조회한 건축물대장 정보 — 분석 정확도를 올리는 사전 사실. */
  building?: BuildingLedgerInfo;
  siteAddress?: string;
}) =>
  api<PhotoWasteItemsResult>('/site-analysis/waste-items', {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ── 물량 추정 (Phase 6)
export const estimateVolume = (input: {
  floorAreaM2: number;
  /** 층수(선택) — 주면 floorAreaM2 를 한 층 바닥면적으로 보고 곱한다. */
  floors?: number;
  structure?: string;
}) => api<VolumeEstimate>('/estimation/volume', { method: 'POST', body: JSON.stringify(input) });
