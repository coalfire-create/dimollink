import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  coachAdvice,
  createCoachState,
  updateCoach,
  type CaptureSample,
  type CoachState,
} from '@dimol/shared';

/**
 * 촬영 코치 — 공유 원본(TS)과 웹 사본(JS)이 **같은 답을 내는지** 못 박는다.
 *
 * `apps/vision-web` 은 빌드 단계가 없는 정적 사이트라 `@dimol/shared` 를 import 할 수
 * 없어 규칙을 한 벌 더 들고 있다. 사본은 조용히 갈라지는 게 문제지 존재 자체가 문제는
 * 아니다 — 그래서 같은 표본을 양쪽에 먹여 결과를 통째로 비교한다. 한쪽만 고치면 여기서
 * 깨진다.
 */

const COACH_JS = readFileSync(
  fileURLToPath(new URL('../../../vision-web/lib/coach.js', import.meta.url)),
  'utf-8',
);

/** 브라우저 전역만 흉내 내면 이 파일은 그대로 돌아간다(DOM 을 쓰지 않는 순수 로직). */
function loadWebCoach() {
  const sandbox = { window: {} as Record<string, unknown> };
  runInNewContext(COACH_JS, createContext(sandbox));
  const dv = sandbox.window.DimolVision as {
    coach: {
      createState: () => CoachState;
      update: (s: CoachState, sample: CaptureSample) => CoachState;
      advise: (s: CoachState, elapsed?: number, target?: number) => unknown;
    };
  };
  return dv.coach;
}

/**
 * 판정 경계를 모두 지나가는 표본열. 임계값 근처(빠름/느림/흐림)와 방위각 유무를 섞는다 —
 * 경계에서만 갈라지는 차이를 잡으려면 중간값만 넣어서는 안 된다.
 */
const SAMPLES: CaptureSample[] = [
  { frameChangeRatio: 0.1, sharpness: 200, azimuth: 0, elapsedSeconds: 0.2 },
  { frameChangeRatio: 0.29, sharpness: 200, azimuth: 30, elapsedSeconds: 0.4 },
  { frameChangeRatio: 0.29, sharpness: 200, azimuth: 60, elapsedSeconds: 1.2 },
  { frameChangeRatio: 0.28, sharpness: 200, azimuth: 60, elapsedSeconds: 1.4 },
  { frameChangeRatio: 0.1, sharpness: 59, azimuth: 90, elapsedSeconds: 2.0 },
  { frameChangeRatio: 0.1, sharpness: 59, azimuth: 90, elapsedSeconds: 3.0 },
  { frameChangeRatio: 0.1, sharpness: 60, azimuth: 120, elapsedSeconds: 3.4 },
  { frameChangeRatio: 0.01, sharpness: 200, azimuth: 150, elapsedSeconds: 4.0 },
  { frameChangeRatio: 0.01, sharpness: 200, azimuth: 150, elapsedSeconds: 5.0 },
  { rotationRateDegPerSec: 41, azimuth: 200, elapsedSeconds: 6.0 },
  { rotationRateDegPerSec: 2, azimuth: 240, elapsedSeconds: 7.0 },
  { rotationRateDegPerSec: 20, elapsedSeconds: 8.0 },
  { frameChangeRatio: 0.15, sharpness: 300, azimuth: 330, elapsedSeconds: 9.0 },
];

describe('촬영 코치 — 공유 원본과 웹 사본의 동등성', () => {
  it('같은 표본열에서 상태와 조언이 완전히 같다', () => {
    const web = loadWebCoach();
    let shared = createCoachState();
    let mirrored = web.createState();
    expect(mirrored).toEqual(shared);

    for (const sample of SAMPLES) {
      shared = updateCoach(shared, sample);
      mirrored = web.update(mirrored, sample);
      expect(mirrored).toEqual(shared);
      // 조언은 화면에 그대로 뜨는 문구다 — 문구까지 같아야 한다.
      expect(web.advise(mirrored, sample.elapsedSeconds)).toEqual(
        coachAdvice(shared, sample.elapsedSeconds),
      );
    }
  });

  it('방위각이 없으면 양쪽 다 시간으로 진행률을 본다', () => {
    const web = loadWebCoach();
    const sample: CaptureSample = { frameChangeRatio: 0.1, elapsedSeconds: 30 };
    const shared = updateCoach(createCoachState(), sample);
    const mirrored = web.update(web.createState(), sample);
    expect(web.advise(mirrored, 30, 60)).toEqual(coachAdvice(shared, 30, 60));
    expect(coachAdvice(shared, 30, 60).coverage).toBe(0.5);
  });
});
