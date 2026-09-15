import { useMemo, useState } from 'react';
import { m2ToPyeong, pyeongToM2, type BuildingStructure, type VolumeEstimate } from '@dimol/shared';
import { ApiError, estimateVolume } from '../../api/client';

/**
 * 물량 추정 입력 상태 — 면적·층수·구조와 계산 결과.
 *
 * 앱에서 연면적을 미리 계산해 보여주지만(한 층 × 층수), 최종 물량은 서버가 정한다.
 * 같은 규칙을 두 곳에 두는 셈이라 위험해 보이지만, 여기 계산은 "지금 얼마나 되는지"를
 * 즉시 보여주기 위한 표시용이고 요청에 실리지 않는다.
 *
 * 입력이 바뀌면 이전 결과는 반드시 지운다 — 30평으로 계산한 결과가 화면에 남은 채
 * 면적만 60평으로 바뀌어 있으면 사용자는 그 숫자를 60평 결과로 읽는다.
 */
export type AreaUnit = 'PYEONG' | 'M2';

export function useVolumeEstimate() {
  const [unit, setUnit] = useState<AreaUnit>('PYEONG');
  const [area, setArea] = useState('');
  const [floors, setFloors] = useState('1');
  const [structure, setStructure] = useState<BuildingStructure | null>(null);
  const [result, setResult] = useState<VolumeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const areaNum = Number(area);
  const floorsNum = Number(floors);
  const areaValid = Number.isFinite(areaNum) && areaNum > 0;
  const floorsValid = Number.isInteger(floorsNum) && floorsNum >= 1;
  const canCalculate = areaValid && floorsValid;

  /** 입력값 → 연면적(㎡) 실시간 미리보기. 서버 계산과 같은 규칙을 쓴다. */
  const totalAreaM2 = useMemo(() => {
    if (!canCalculate) return null;
    const perFloorM2 = unit === 'PYEONG' ? pyeongToM2(areaNum) : areaNum;
    return Math.round(perFloorM2 * floorsNum * 10) / 10;
  }, [canCalculate, unit, areaNum, floorsNum]);

  function resetResult() {
    setResult(null);
    setError(null);
  }

  /** 단위를 바꾸면 입력한 숫자도 새 단위로 환산한다 — 30평이 30㎡ 가 되면 안 된다. */
  function changeUnit(next: AreaUnit) {
    if (next === unit) return;
    if (areaValid) setArea(String(next === 'M2' ? pyeongToM2(areaNum) : m2ToPyeong(areaNum)));
    setUnit(next);
    resetResult();
  }

  function changeArea(value: string) {
    setArea(value);
    resetResult();
  }

  function changeFloors(value: string) {
    setFloors(value);
    resetResult();
  }

  /** 같은 구조를 다시 누르면 선택 해제 — 구조는 선택 입력이다. */
  function toggleStructure(value: BuildingStructure) {
    setStructure((prev) => (prev === value ? null : value));
    resetResult();
  }

  async function calculate() {
    if (!canCalculate) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(
        await estimateVolume({
          floorAreaM2: unit === 'PYEONG' ? pyeongToM2(areaNum) : areaNum,
          floors: floorsNum,
          structure: structure ?? undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '계산에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  /** 입력이 잘못됐을 때 무엇이 문제인지 — 버튼만 비활성이면 이유를 알 수 없다. */
  const inputWarning =
    canCalculate || area.length === 0
      ? null
      : !areaValid
        ? '면적을 숫자로 입력해 주세요.'
        : '층수는 1 이상 정수로 입력해 주세요.';

  return {
    unit,
    changeUnit,
    area,
    areaNum,
    changeArea,
    floors,
    floorsNum,
    changeFloors,
    structure,
    toggleStructure,
    totalAreaM2,
    canCalculate,
    inputWarning,
    result,
    error,
    loading,
    calculate,
  };
}

export type VolumeEstimateState = ReturnType<typeof useVolumeEstimate>;
