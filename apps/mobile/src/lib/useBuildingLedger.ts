import { useEffect, useRef, useState } from 'react';
import { getBuildingInfo } from '../api/client';
import { hasLedgerData, type BuildingLedgerInfo } from '@dimol/shared';

/**
 * 건축물대장(공공데이터) 사전 조회 — 요청 폼과 현장 진단 화면이 같이 쓴다.
 *
 * 디몰비전은 "주소 먼저 → 그 건물이 무엇인지 확인 → 그 다음 촬영" 순서를 강제한다.
 * 여기서 확보한 사실(주용도·구조·층수·연면적·사용승인일)이 사진 분석의 기준이 되고,
 * 폼의 면적·층수·승강기 칸도 이 값으로 미리 채워진다.
 *
 * 조회 실패는 오류가 아니다 — 미등기·무허가 건물이 실제로 많아서, 못 찾아도 접수는 계속된다.
 */
export type LedgerState = 'idle' | 'loading' | 'found' | 'none';

export function useBuildingLedger({
  prefilledAddress,
  onApply,
}: {
  /** 링크로 넘어와 주소 선택기를 거치지 않은 주소 — 있으면 최초 1회 조회한다. */
  prefilledAddress?: string;
  /**
   * 대장을 찾았을 때 폼에 반영하는 쪽(선택). 이미 사용자가 채운 칸을 건드리지 않는 건 호출부 책임.
   * 폼이 아니라 보여주기만 하는 화면(현장 진단)은 넘기지 않는다.
   */
  onApply?: (info: BuildingLedgerInfo) => void;
}) {
  const [building, setBuilding] = useState<BuildingLedgerInfo | null>(null);
  const [state, setState] = useState<LedgerState>('idle');

  // 주소를 연달아 바꿔도 늦게 도착한 이전 응답이 최신 주소를 덮어쓰지 않도록 하는 순번.
  const seqRef = useRef(0);
  // 같은 주소 재조회 방지(지오코딩+공공API 왕복 2회를 아낀다).
  const cacheRef = useRef(new Map<string, BuildingLedgerInfo | null>());
  // onApply 는 매 렌더 새로 만들어져도 되게 ref 로 잡는다.
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  async function fetchLedger(address: string): Promise<void> {
    const key = address.trim();
    if (!key) {
      setBuilding(null);
      setState('idle');
      return;
    }
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    const cached = cacheRef.current.get(key);
    if (cached !== undefined) {
      setBuilding(cached);
      setState(hasLedgerData(cached) ? 'found' : 'none');
      if (cached && hasLedgerData(cached)) applyRef.current?.(cached);
      return;
    }

    setBuilding(null);
    setState('loading');
    let info: BuildingLedgerInfo | null = null;
    try {
      info = await getBuildingInfo(key);
    } catch {
      info = null; // 대장 조회 실패는 촬영을 막지 않는다(보조 정보).
    }
    cacheRef.current.set(key, info);
    if (seqRef.current !== seq) return; // 더 최신 주소 조회가 진행 중 — 결과 폐기.
    setBuilding(info);
    setState(hasLedgerData(info) ? 'found' : 'none');
    if (info && hasLedgerData(info)) applyRef.current?.(info);
  }

  // 프리필 주소는 주소 선택기를 거치지 않아 조회가 안 걸린다. 대장 없이 폼만 채우면
  // 디몰비전에서 이미 확인한 건물 정보가 여기서 도로 비어 보인다.
  const fetchRef = useRef(fetchLedger);
  fetchRef.current = fetchLedger;
  useEffect(() => {
    if (prefilledAddress) void fetchRef.current(prefilledAddress);
  }, [prefilledAddress]);

  return { building, state, fetchLedger };
}
