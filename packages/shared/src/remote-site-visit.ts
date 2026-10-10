import {
  canScheduleMoreVisits,
  siteVisitMode,
  type DemolitionEstimate,
  type SiteVisit,
} from './demolition-estimate.js';
import type { RemoteSurvey } from './remote-survey.js';

/**
 * 원격 실사로 진행 — 업체가 현장에 가지 않고, 소비자가 보낸 원격 실사 자료([[remote-survey]])로
 * 실사를 마쳤다고 **견적에 기록**한다.
 *
 * 왜 필요한가: 지금까지 견적이 원격(REMOTE)으로 남는 길은 영상통화 예약([[video-survey]])뿐이었다.
 * 사진만 보고 확정 견적을 내면 방문 실사로 기록돼, 원격 견적이 방문 견적과 얼마나 같은지
 * 재는 정합성 표본([[estimate-parity]])이 거의 쌓이지 않았다.
 *
 * 규칙(서버·화면이 같은 답을 내도록 여기 하나):
 *  1. 확정 견적이 이미 나왔거나 떨어진(DECLINED) 견적은 바꾸지 않는다 — 기록을 고쳐 쓰지 않는다.
 *  2. 소비자가 **제출한** 같은 요청의 패키지가 있어야 한다 — 반쪽 자료로 실사를 끝냈다고 하면 안 된다.
 *  3. 실사가 없으면 새로 잡는다. 이때도 요청당 실사 상한([[demolition-estimate]]
 *     MAX_SITE_VISITS_PER_REQUEST)을 지킨다 — 영상통화 원격 실사와 같은 규칙이다.
 *  4. 이미 잡힌 실사(방문 또는 영상통화)는 일시·통화 id 를 그대로 두고 방식만 원격으로 바꾸며
 *     패키지 id 를 붙인다. 방문에서 바뀐 경우는 소비자에게 알려야 하므로 표시해 돌려준다.
 */

export type RemoteSiteVisitPlan =
  | {
      ok: true;
      visit: SiteVisit;
      /** false 면 이미 같은 내용이 기록돼 있다(두 번 눌러도 한 번). 저장·알림을 건너뛴다. */
      changed: boolean;
      /** 소비자가 잡은 방문 실사를 원격으로 바꿨는가 — 소비자에게 알린다. */
      convertedFromInPerson: boolean;
    }
  | { ok: false; error: string };

export function planRemoteSiteVisit(
  estimate: DemolitionEstimate,
  survey: Pick<RemoteSurvey, 'id' | 'requestId' | 'status'> | undefined,
  siblings: readonly DemolitionEstimate[],
  nowIso: string,
): RemoteSiteVisitPlan {
  if (estimate.final) {
    return { ok: false, error: '확정 견적을 낸 뒤에는 실사 방식을 바꿀 수 없습니다.' };
  }
  if (estimate.stage === 'DECLINED') {
    return { ok: false, error: '마감된 견적입니다.' };
  }
  if (!survey || survey.requestId !== estimate.requestId || survey.status !== 'SUBMITTED') {
    return {
      ok: false,
      error: '신청자가 원격 실사 자료를 아직 보내지 않았습니다. 자료가 오면 알려 드려요.',
    };
  }

  const current = estimate.visit;
  if (!current) {
    if (!canScheduleMoreVisits(siblings)) {
      return {
        ok: false,
        error: '이 요청은 실사 업체가 이미 다 찼습니다(최대 3곳). 신청자에게 문의해 주세요.',
      };
    }
    return {
      ok: true,
      visit: { scheduledAt: nowIso, mode: 'REMOTE', remoteSurveyId: survey.id },
      changed: true,
      convertedFromInPerson: false,
    };
  }

  const wasRemote = siteVisitMode(current) === 'REMOTE';
  if (wasRemote && current.remoteSurveyId === survey.id) {
    return { ok: true, visit: current, changed: false, convertedFromInPerson: false };
  }
  return {
    ok: true,
    visit: { ...current, mode: 'REMOTE', remoteSurveyId: survey.id },
    changed: true,
    convertedFromInPerson: !wasRemote,
  };
}
