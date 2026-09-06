import {
  estimateTonsFromScan,
  impliedStoreyHeightM,
  toTruckLoads,
  type BuildingStructure,
  type ScanScaleSource,
  type Scan3DQuality,
  type VolumeEstimate,
} from '@dimol/shared';
import {
  EstimationValidationError,
  type EstimateVolumeInput,
  type VolumeEstimator,
} from './provider.js';

/**
 * 3D 스캔 실측 부피로 물량을 산정하는 추정기.
 *
 * 연면적 원단위(`HeuristicVolumeEstimator`)가 못 보던 두 가지를 잡는다 — **층고**와
 * **대장에 없는 증축부·부속 건물**. 대신 복원이 실패하거나 스케일 근거가 없으면
 * 부피가 통째로 틀리므로, 그럴 땐 **원단위 추정기로 폴백한다**.
 * 나쁜 스캔의 실측값은 통계 추정보다 나쁘다 — "실측"이라는 이름값에 속으면 안 된다.
 */
export class ScanVolumeEstimator implements VolumeEstimator {
  constructor(private readonly fallback: VolumeEstimator) {}

  async estimate(input: EstimateVolumeInput): Promise<VolumeEstimate> {
    const scan = input.scan;
    if (!scan) return this.fallback.estimate(input);

    const result = estimateTonsFromScan({
      grossVolumeM3: scan.grossVolumeM3,
      structure: input.structure,
      scaleSource: scan.scaleSource,
      quality: scan.quality,
    });

    if (!result.usable) {
      // 스캔을 못 쓰면 조용히 버리지 않는다 — 왜 폴백했는지 로그로 남긴다.
      console.info('[scan-estimate] 스캔 부피 사용 불가 → 원단위 폴백:', result.reasons.join(' '));
      return this.fallbackWithReasons(input, result.reasons);
    }

    // 연면적을 알면 스캔이 알려준 평균 층고를 함께 보여준다(추정이 달라진 이유).
    const floorAreaM2 = totalAreaOf(input);
    const storeyHeight = floorAreaM2
      ? impliedStoreyHeightM(result.grossVolumeM3, floorAreaM2)
      : undefined;

    return {
      estimatedTons: result.estimatedTons,
      rangeMinTons: result.rangeMinTons,
      rangeMaxTons: result.rangeMaxTons,
      floorAreaM2: floorAreaM2 ?? 0,
      truckLoads: toTruckLoads(result.estimatedTons),
      // 실측이라도 스케일 출처가 대장 역산이면 대장 오차를 물려받는다.
      confidence: scan.scaleSource === 'AR_POSE' ? 'HIGH' : 'MEDIUM',
      method: 'SCAN_VOLUME',
      disclaimer: buildDisclaimer(result.grossVolumeM3, result.scaleSource, storeyHeight),
      estimatedAt: new Date().toISOString(),
    };
  }

  /** 폴백하되 왜 실측을 못 썼는지 고지에 남긴다(사용자가 재촬영을 판단할 수 있게). */
  private async fallbackWithReasons(
    input: EstimateVolumeInput,
    reasons: string[],
  ): Promise<VolumeEstimate> {
    const base = await this.fallback.estimate(input);
    return {
      ...base,
      disclaimer: `${base.disclaimer} (3D 스캔 실측은 사용하지 못했습니다: ${reasons.join(' ')})`,
    };
  }
}

/** 입력에서 연면적을 만든다. 없으면 undefined. */
function totalAreaOf(input: EstimateVolumeInput): number | undefined {
  if (typeof input.floorAreaM2 !== 'number' || input.floorAreaM2 <= 0) return undefined;
  return Math.round(input.floorAreaM2 * (input.floors ?? 1) * 10) / 10;
}

const SCALE_LABEL: Record<ScanScaleSource, string> = {
  AR_POSE: '기기 측위로 실제 치수를 직접 측정',
  REFERENCE_OBJECT: '기준 물체로 실제 치수를 환산',
  LEDGER_AREA: '건축물대장 연면적으로 치수를 역산',
  NONE: '치수 기준 없음',
};

function buildDisclaimer(
  volumeM3: number,
  scaleSource: ScanScaleSource,
  storeyHeightM?: number,
): string {
  const height = storeyHeightM ? ` 평균 층고 약 ${storeyHeightM}m 가 반영됐습니다.` : '';
  return (
    `3D 스캔 실측 부피 약 ${volumeM3}㎥ 기준 추정입니다(${SCALE_LABEL[scaleSource]}).${height} ` +
    '실제 물량은 현장 실사로 확정하며, 견적·계약의 근거로 단독 사용하지 마세요.'
  );
}

/** 라우트·테스트가 함께 쓰는 스캔 실측 입력. */
export interface ScanMeasurement {
  grossVolumeM3: number;
  scaleSource: ScanScaleSource;
  quality: Scan3DQuality;
}

/** 구조 코드 유효성(라우트 입력 검증용). */
export function assertStructure(value: unknown): BuildingStructure | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'RC' || value === 'BRICK' || value === 'WOOD') return value;
  throw new EstimationValidationError('structure 는 RC | BRICK | WOOD 여야 합니다.');
}
