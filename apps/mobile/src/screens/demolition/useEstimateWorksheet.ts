import { useCallback, useEffect, useState } from 'react';
import type { DemolitionEstimate, ProviderEstimateAccuracy, ServiceRequest } from '@dimol/shared';
import {
  ApiError,
  getEstimateAccuracy,
  getPricing,
  getRequest,
  listDemolitionEstimates,
  submitFinalEstimate,
  submitPreliminaryEstimate,
} from '../../api/client';
import { useSession } from '../../navigation';

/**
 * 견적 산정 화면의 데이터 — 요청, 내 견적, 내 단가, 내 개산 정확도.
 *
 * 필수와 부가를 나눠 부른다. 요청과 내 견적은 없으면 화면이 성립하지 않아 오류를 띄우지만,
 * 단가·정확도는 **없어도 견적은 낼 수 있어야** 해서 실패를 삼킨다.
 *
 * 견적 목록은 밀봉이라 서버가 내 것만 돌려준다 — 앱에서 거르지 않는다.
 */
export function useEstimateWorksheet(requestId: string) {
  const user = useSession();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [mine, setMine] = useState<DemolitionEstimate | null>(null);
  const [accuracy, setAccuracy] = useState<ProviderEstimateAccuracy | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [req, rows] = await Promise.all([
        getRequest(requestId),
        listDemolitionEstimates(requestId),
      ]);
      setRequest(req);
      setMine(rows[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }

    // 단가·정확도는 부가 정보 — 실패해도 견적은 낼 수 있어야 한다.
    void getPricing(user.id)
      .then((pricing) => setUnitPrice(pricing?.unitPrice ?? null))
      .catch(() => setUnitPrice(null));
    void getEstimateAccuracy(user.id)
      .then(setAccuracy)
      .catch(() => setAccuracy(null));
  }, [requestId, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 제출 계열 동작의 공통 껍데기 — 중복 제출을 막고, 끝나면 다시 불러온다. */
  async function run(fn: () => Promise<unknown>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return {
    request,
    mine,
    accuracy,
    unitPrice,
    loading,
    busy,
    error,
    load,
    submitPreliminary: (input: { minAmount: number; maxAmount: number; memo?: string }) =>
      void run(
        () => submitPreliminaryEstimate({ requestId, ...input }),
        '개산 견적 제출에 실패했습니다.',
      ),
    submitFinal: (input: { amount: number; overrunReason?: string }) => {
      if (!mine) return;
      void run(
        () => submitFinalEstimate({ estimateId: mine.id, ...input }),
        '확정 견적 제출에 실패했습니다.',
      );
    },
  };
}
