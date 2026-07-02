import type { ProviderRole } from './types.js';

/**
 * 견적 히스토리·평균 시세 (로드맵 Phase 3 · 매칭 알고리즘 고도화).
 * 업체(운반/처리)가 요청 건에 제시한 견적을 기록하고, 배출자에게 평균 시세를 보여준다.
 */

export interface Quote {
  id: string;
  /** 견적 대상 요청. */
  requestId: string;
  /** 견적 제시 업체. */
  providerId: string;
  /** 운반 견적인지 처리 견적인지. */
  party: ProviderRole;
  /** 견적가(원, 양의 정수). */
  amount: number;
  memo?: string;
  createdAt: string;
}

/** 평균 시세 요약 — 요청 화면에서 "이 정도가 적정가" 안내에 사용. */
export interface MarketRate {
  party: ProviderRole;
  /** 집계에 포함된 견적 수. */
  quoteCount: number;
  /** 평균 견적가(원, 반올림). 견적 없으면 null. */
  averageAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  /** 톤당 평균 단가(원/톤, 반올림). 톤수 있는 요청의 견적만 반영. */
  averagePerTon: number | null;
}
