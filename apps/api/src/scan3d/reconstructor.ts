import {
  DEFAULT_STRIDE_M,
  SCAN_3D_STAGE_LABELS,
  resolveScale,
  type Scan3DResult,
  type Scan3DStage,
  type ScanTarget,
} from '@dimol/shared';

/**
 * 3D 복원 실행기 어댑터 — 올바로·비전 분석과 같은 "목 ↔ 실제" 구조.
 *
 * 실제 복원은 GPU VM 의 `apps/vision-api/app/scan3d` 파이프라인이 수행한다.
 * 본체는 그 서버를 HTTP 로 부르거나(키 설정 시), 없으면 목으로 동작한다.
 */

export interface ReconstructInput {
  jobId: string;
  videoKey: string;
  target: ScanTarget;
  /** 스케일 역산용 — 건축물대장 연면적(㎡). */
  ledgerFloorAreaM2?: number;
  hasArPose?: boolean;
  /**
   * 촬영 중 걸음수. 복원 카메라 경로 길이와 대조해 실제 치수 배율을 얻는다.
   * 대장 역산보다 오차폭이 좁아, 둘 다 있으면 이쪽이 우선한다([[scan-volume]] resolveScale).
   */
  steps?: number;
}

export type StageReporter = (stage: Scan3DStage) => void;

export interface Reconstructor {
  reconstruct(input: ReconstructInput, onStage: StageReporter): Promise<Scan3DResult>;
}

/** 진행 단계 순서 — 목과 실제가 같은 순서를 보고한다. */
export const SCAN_STAGE_ORDER: readonly Scan3DStage[] = [
  'UPLOADING',
  'EXTRACTING',
  'MATCHING',
  'RECONSTRUCTING',
  'SPLATTING',
  'MEASURING',
];

/**
 * 목 복원기 — GPU 없이 화면·큐·진행률을 끝까지 검증할 수 있게 한다.
 * 단계를 순서대로 보고하고 결정적인 결과를 낸다.
 */
export class MockReconstructor implements Reconstructor {
  constructor(private readonly stageDelayMs = 0) {}

  async reconstruct(input: ReconstructInput, onStage: StageReporter): Promise<Scan3DResult> {
    for (const stage of SCAN_STAGE_ORDER) {
      onStage(stage);
      if (this.stageDelayMs > 0) await delay(this.stageDelayMs);
    }
    // 대장 연면적이 있으면 층고 3m 를 가정한 부피를 돌려준다(원단위와 같은 답).
    const volume = input.ledgerFloorAreaM2 ? input.ledgerFloorAreaM2 * 3 : 300;
    // 스케일 우선순위는 공유 로직이 정한다 — 목이 다른 답을 내면 안 된다.
    const { source } = resolveScale({
      arPoseFactor: input.hasArPose ? 1 : undefined,
      steps: input.steps,
      // 목은 복원을 하지 않으므로 경로 길이를 걸음수와 정합하는 값으로 가정한다.
      reconstructedPathLengthUnits: input.steps ? input.steps * DEFAULT_STRIDE_M : undefined,
      ledgerTotalFloorAreaM2: input.ledgerFloorAreaM2,
      reconstructedFloorAreaUnits: input.ledgerFloorAreaM2 ? 1 : undefined,
    });
    return {
      grossVolumeM3: volume,
      rawVolumeUnits: volume,
      scaleSource: source,
      usable: source !== 'NONE',
      reasons:
        source === 'NONE' ? ['실제 치수 기준이 없어 부피를 계산할 수 없습니다.'] : [],
      artifacts: {},
      frameCount: 150,
    };
  }
}

export interface HttpReconstructorConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

/**
 * 실제 복원 서버(vision-api) 호출.
 * 복원은 20~40분이라 요청-응답으로 기다리지 않고, 잡을 만들고 폴링한다.
 */
export class HttpReconstructor implements Reconstructor {
  constructor(private readonly config: HttpReconstructorConfig) {}

  async reconstruct(input: ReconstructInput, onStage: StageReporter): Promise<Scan3DResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/v1/scans`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          job_id: input.jobId,
          video_key: input.videoKey,
          target: input.target,
          ledger_floor_area_m2: input.ledgerFloorAreaM2,
          has_ar_pose: input.hasArPose,
          steps: input.steps,
        }),
      });
      if (!res.ok) throw new Error(`scan3d ${res.status}`);
      const body = (await res.json()) as {
        stage?: string;
        grossVolumeM3?: number;
        scaleSource?: string;
        usable?: boolean;
        reasons?: unknown;
        frameCount?: number;
        artifacts?: Record<string, string>;
      };
      if (body.stage && isStage(body.stage)) onStage(body.stage);
      return normalizeResult(body);
    } finally {
      clearTimeout(timer);
    }
  }
}

function isStage(value: string): value is Scan3DStage {
  return value in SCAN_3D_STAGE_LABELS;
}

/** 복원 서버 응답을 계약으로 정규화(누락 필드는 안전한 기본값). */
export function normalizeResult(body: {
  grossVolumeM3?: number;
  rawVolumeUnits?: number;
  scaleSource?: string;
  usable?: boolean;
  reasons?: unknown;
  frameCount?: number;
  artifacts?: Record<string, string>;
}): Scan3DResult {
  const scale = body.scaleSource;
  return {
    grossVolumeM3: typeof body.grossVolumeM3 === 'number' ? body.grossVolumeM3 : 0,
    // 배율 재계산(기준 물체 재측정)을 위해 원시 부피를 보존한다 — 없으면 GPU 재실행이 필요해진다.
    rawVolumeUnits:
      typeof body.rawVolumeUnits === 'number' && body.rawVolumeUnits > 0
        ? body.rawVolumeUnits
        : undefined,
    scaleSource:
      scale === 'AR_POSE' ||
      scale === 'REFERENCE_OBJECT' ||
      scale === 'WALKING_DISTANCE' ||
      scale === 'LEDGER_AREA'
        ? scale
        : 'NONE',
    // 서버가 usable 을 말해주지 않으면 쓰지 않는다 — 모르면 안 쓰는 쪽이 안전하다.
    usable: body.usable === true,
    reasons: Array.isArray(body.reasons)
      ? body.reasons.filter((r): r is string => typeof r === 'string')
      : [],
    artifacts: {
      splatKey: body.artifacts?.scene,
      meshKey: body.artifacts?.mesh,
      thumbnailKey: body.artifacts?.thumbnail,
    },
    frameCount: typeof body.frameCount === 'number' ? body.frameCount : 0,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
