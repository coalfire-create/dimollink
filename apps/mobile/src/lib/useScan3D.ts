import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingLedgerInfo, Scan3DJob } from '@dimol/shared';
import {
  ApiError,
  SCAN_POLL_INTERVAL_MS,
  createScanJob,
  getScanJob,
  getScanSceneUrl,
  presignScanVideo,
  uploadScanVideo,
} from '../api/client';
import type { Scan3DCaptureResult } from '../components/Scan3DCaptureModal';

/**
 * 3D 스캔 한 사이클 — 업로드 → 잡 생성 → 완료까지 폴링 → 장면 URL 확보.
 *
 * 화면이 이 순서를 직접 들고 있으면 다른 진입점(요청 폼 등)에서 재현하기 어려워
 * 훅으로 뺐다. 실패는 예외로 던지지 않고 `error` 로 노출한다 — 촬영은 끝났는데
 * 업로드만 실패한 경우에도 사용자가 재시도할 수 있어야 한다.
 */

export interface UseScan3D {
  job: Scan3DJob | null;
  /** 완료된 장면의 presigned URL. 복원 전이거나 산출물이 없으면 undefined. */
  sceneUrl?: string;
  busy: boolean;
  error: string | null;
  start: (capture: Scan3DCaptureResult, building?: BuildingLedgerInfo) => Promise<void>;
  reset: () => void;
}

export function useScan3D(): UseScan3D {
  const [job, setJob] = useState<Scan3DJob | null>(null);
  const [sceneUrl, setSceneUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 화면을 떠난 뒤 폴링이 계속 도는 것을 막는다.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setJob(null);
    setSceneUrl(undefined);
    setError(null);
    setBusy(false);
  }, []);

  const start = useCallback(
    async (capture: Scan3DCaptureResult, building?: BuildingLedgerInfo) => {
      setBusy(true);
      setError(null);
      setSceneUrl(undefined);
      setJob(null);
      try {
        // ① 로컬 영상 파일을 읽는다(크기를 알아야 presign 서명이 만들어진다).
        const blob = await (await fetch(capture.videoUri)).blob();
        const contentType = blob.type || 'video/mp4';

        // ② presign → 스토리지에 직접 업로드(API 를 거치지 않는다 — 최대 200MB).
        const presigned = await presignScanVideo(contentType, blob.size);
        await uploadScanVideo(presigned, blob);

        // ③ 복원 잡 생성. 대장 정보는 AR 포즈가 없을 때 스케일 역산 근거가 된다.
        const { jobId } = await createScanJob({
          videoKey: presigned.key,
          target: capture.target,
          building,
        });

        // ④ 완료까지 폴링. 20~40분 걸리므로 촘촘히 묻지 않는다.
        await pollUntilDone(jobId, alive, setJob, setSceneUrl);
      } catch (err) {
        if (!alive.current) return;
        setError(
          err instanceof ApiError ? err.message : '3D 스캔 처리에 실패했어요. 다시 시도해 주세요.',
        );
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [],
  );

  return { job, sceneUrl, busy, error, start, reset };
}

async function pollUntilDone(
  jobId: string,
  alive: React.MutableRefObject<boolean>,
  setJob: (job: Scan3DJob) => void,
  setSceneUrl: (url?: string) => void,
): Promise<void> {
  for (;;) {
    if (!alive.current) return;
    const current = await getScanJob(jobId);
    setJob(current);

    if (current.status === 'COMPLETED') {
      const key = current.result?.artifacts.splatKey;
      if (key) {
        try {
          setSceneUrl((await getScanSceneUrl(key)).viewUrl);
        } catch {
          // 장면 URL 실패는 부피 결과까지 버릴 이유가 아니다 — 뷰어만 못 열 뿐이다.
        }
      }
      return;
    }
    if (current.status === 'FAILED') return;

    await delay(SCAN_POLL_INTERVAL_MS);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
