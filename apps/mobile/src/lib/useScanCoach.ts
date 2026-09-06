import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import {
  coachAdvice,
  createCoachState,
  updateCoach,
  type CoachAdvice,
  type CoachState,
} from '@dimol/shared';

/**
 * 촬영 코치 훅 — 3D 스캔을 찍는 **도중에** 화면으로 잘못을 알려준다.
 *
 * 판정 로직은 전부 공유 순수 함수([[scan-coach]])에 있고, 여기서는 센서 값을 그 형식으로
 * 바꿔 먹이기만 한다. 그래야 판정 규칙이 화면·플랫폼마다 갈라지지 않고 테스트도 된다.
 *
 * 왜 카메라 프레임이 아니라 센서인가: 실시간 프레임 처리는 네이티브 프레임 프로세서가
 * 필요한데, 회전 속도만으로도 실패 원인의 대부분(너무 빠름 → 모션 블러 + 겹침 부족)이
 * 잡힌다. 나침반 방위각을 누적하면 어느 방향을 안 찍었는지까지 알 수 있다.
 */

/** 센서 갱신 주기(ms). 너무 촘촘하면 배터리만 먹고 판정은 나아지지 않는다. */
const SAMPLE_INTERVAL_MS = 200;

export interface ScanCoach {
  advice: CoachAdvice;
  /** 아직 안 찍은 구간이 있는지 — 촬영 종료 버튼 문구를 바꾸는 데 쓴다. */
  state: CoachState;
  /** 센서를 못 쓰는 기기인지(코치 없이도 촬영은 된다). */
  supported: boolean;
}

/**
 * @param active 촬영 중일 때만 센서를 구독한다(대기 중 배터리 낭비 방지).
 */
export function useScanCoach(active: boolean): ScanCoach {
  const [state, setState] = useState<CoachState>(createCoachState);
  const [supported, setSupported] = useState(true);
  // 상태 갱신이 리스너보다 늦어 값을 덮어쓰지 않도록 ref 로 최신 상태를 들고 간다.
  const stateRef = useRef(state);
  stateRef.current = state;
  const startedAt = useRef(0);

  useEffect(() => {
    if (!active) {
      setState(createCoachState());
      return;
    }

    startedAt.current = Date.now();
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync())) {
          if (!cancelled) setSupported(false);
          return;
        }
        // 웹·iOS 는 권한이 필요할 수 있다. 거부돼도 촬영은 막지 않는다.
        const permission = await DeviceMotion.requestPermissionsAsync();
        if (!permission.granted) {
          if (!cancelled) setSupported(false);
          return;
        }
        if (cancelled) return;

        DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);
        subscription = DeviceMotion.addListener((data) => {
          const rate = data.rotationRate;
          // rotationRate 는 라디안/초로 오는 플랫폼이 있어 도/초로 정규화한다.
          const magnitude = rate
            ? Math.sqrt((rate.alpha ?? 0) ** 2 + (rate.beta ?? 0) ** 2 + (rate.gamma ?? 0) ** 2)
            : 0;
          const degPerSec = Platform.OS === 'web' ? magnitude : magnitude * (180 / Math.PI);

          setState((prev) =>
            updateCoach(prev, {
              rotationRateDegPerSec: degPerSec,
              // 나침반 방위각(0~359). 없으면 커버리지는 세지 않는다.
              azimuth:
                typeof data.rotation?.alpha === 'number'
                  ? (((-data.rotation.alpha * (180 / Math.PI)) % 360) + 360) % 360
                  : undefined,
              elapsedSeconds: (Date.now() - startedAt.current) / 1000,
            }),
          );
        });
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active]);

  return { advice: coachAdvice(state), state, supported };
}
