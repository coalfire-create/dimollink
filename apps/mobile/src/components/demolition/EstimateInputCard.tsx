import React from 'react';
import type { DemolitionEstimate, FloorAreaBasis } from '@dimol/shared';
import { MyEstimateCard } from './MyEstimateCard';
import { PreliminaryEstimateForm } from './PreliminaryEstimateForm';

/**
 * 철거업체의 견적 입력 — 개산(범위) → 실사 → 확정의 단계에 따라 화면이 갈린다.
 *
 * 아직 아무것도 안 냈으면 개산 폼, 냈으면 현황 카드. 두 화면은 받는 값도 검증도 달라서
 * 파일을 나눴다. 여기서는 어느 쪽을 보여줄지만 정한다.
 */
export function EstimateInputCard({
  mine,
  area,
  wasteTons,
  myUnitPrice,
  busy,
  error,
  onSubmitPreliminary,
  onSubmitFinal,
}: {
  mine: DemolitionEstimate | null;
  area: FloorAreaBasis | null;
  wasteTons: number;
  /** 마이페이지에 저장해 둔 내 단가(원/㎡). 없으면 제안을 띄우지 않는다. */
  myUnitPrice: number | null;
  busy: boolean;
  error: string | null;
  onSubmitPreliminary: (input: { minAmount: number; maxAmount: number; memo?: string }) => void;
  onSubmitFinal: (input: { amount: number; overrunReason?: string }) => void;
}) {
  if (!mine) {
    return (
      <PreliminaryEstimateForm
        area={area}
        wasteTons={wasteTons}
        myUnitPrice={myUnitPrice}
        busy={busy}
        error={error}
        onSubmit={onSubmitPreliminary}
      />
    );
  }

  return (
    <MyEstimateCard
      mine={mine}
      area={area}
      wasteTons={wasteTons}
      busy={busy}
      error={error}
      onSubmitFinal={onSubmitFinal}
    />
  );
}
