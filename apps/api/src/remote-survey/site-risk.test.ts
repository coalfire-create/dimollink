import { describe, expect, it } from 'vitest';
import {
  buildSiteRiskFlags,
  planRemoteSiteVisit,
  type DemolitionEstimate,
  type RemoteSurveyAnswers,
  type SiteRiskSurveyInput,
} from '@dimol/shared';

/**
 * 가상 현장 검토의 공유 판정 — 위험 신호 모으기, 원격 실사 기록 계획.
 */

function survey(answers: RemoteSurveyAnswers, items: SiteRiskSurveyInput['items'] = {}) {
  return { answers, items };
}

const ids = (flags: ReturnType<typeof buildSiteRiskFlags>) => flags.map((f) => f.id);

describe('buildSiteRiskFlags', () => {
  it('아무 신호가 없으면 빈 목록', () => {
    expect(
      buildSiteRiskFlags(
        survey({
          basement: 'NO',
          roofType: 'TILE',
          knownAsbestos: 'NO',
          accessWidth: 'OVER_4M',
          buildingEmpty: true,
        }),
        { useAprDay: '20150301' },
      ),
    ).toEqual([]);
  });

  it('슬레이트 지붕 답이면 석면 의심(DANGER)', () => {
    const flags = buildSiteRiskFlags(survey({ roofType: 'SLATE' }), null);
    expect(flags[0]).toMatchObject({ id: 'ASBESTOS', level: 'DANGER', itemId: 'ROOF' });
  });

  it('답이 없어도 대장 사용승인 시기가 석면 시기면 띄운다', () => {
    const [flag] = buildSiteRiskFlags(null, { useAprDay: '19950101' });
    expect(flag.id).toBe('ASBESTOS');
    // 업체가 가장 먼저 묻는 "몇 년 건물인가"를 그대로 보여준다.
    expect(flag.detail).toContain('1995년');
    expect(ids(buildSiteRiskFlags(null, { useAprDay: '20150101' }))).not.toContain('ASBESTOS');
  });

  it('지하: 답 YES 나 대장 지하층이면 DANGER, 모름이면 CHECK', () => {
    expect(buildSiteRiskFlags(survey({ basement: 'YES' }), null)[0]).toMatchObject({
      id: 'BASEMENT',
      level: 'DANGER',
    });
    expect(buildSiteRiskFlags(survey({ basement: 'NO' }), { ugrndFlrCnt: 1 })[0]).toMatchObject({
      id: 'BASEMENT',
      level: 'DANGER',
    });
    expect(buildSiteRiskFlags(survey({ basement: 'UNKNOWN' }), null)[0]).toMatchObject({
      id: 'BASEMENT',
      level: 'CHECK',
    });
  });

  it('진입로: 2m 미만 DANGER, 2~3m CHECK, 그 이상은 없음', () => {
    expect(buildSiteRiskFlags(survey({ accessWidth: 'UNDER_2M' }), null)[0].level).toBe('DANGER');
    expect(buildSiteRiskFlags(survey({ accessWidth: 'FROM_2M_TO_3M' }), null)[0].level).toBe(
      'CHECK',
    );
    expect(buildSiteRiskFlags(survey({ accessWidth: 'FROM_3M_TO_4M' }), null)).toEqual([]);
  });

  it('전깃줄·옆 건물은 사진이 있을 때만, 짐이 남아 있으면 CHECK', () => {
    const flags = buildSiteRiskFlags(
      survey({ buildingEmpty: false }, { OVERHEAD_WIRES: ['a'], NEIGHBOR_GAP: ['b', 'c'] }),
      null,
    );
    expect(ids(flags)).toEqual(['OVERHEAD_WIRES', 'NEIGHBOR_GAP', 'NOT_EMPTY']);
    expect(flags[1].detail).toContain('2장');
  });

  it('DANGER 가 CHECK 보다 먼저 온다', () => {
    const flags = buildSiteRiskFlags(
      survey({ buildingEmpty: false, accessWidth: 'UNDER_2M' }, { OVERHEAD_WIRES: ['a'] }),
      null,
    );
    expect(flags.map((f) => f.level)).toEqual(['DANGER', 'CHECK', 'CHECK']);
  });
});

describe('planRemoteSiteVisit', () => {
  const NOW = '2026-10-10T00:00:00.000Z';
  const submitted = { id: 's1', requestId: 'r1', status: 'SUBMITTED' as const };

  function estimate(over: Partial<DemolitionEstimate> = {}): DemolitionEstimate {
    return {
      id: 'e1',
      requestId: 'r1',
      providerId: 'p1',
      stage: 'PRELIMINARY',
      preliminary: { minAmount: 1, maxAmount: 2, createdAt: NOW },
      createdAt: NOW,
      ...over,
    };
  }

  it('실사가 없으면 지금 시각으로 원격 실사를 새로 잡는다', () => {
    const plan = planRemoteSiteVisit(estimate(), submitted, [estimate()], NOW);
    expect(plan).toEqual({
      ok: true,
      visit: { scheduledAt: NOW, mode: 'REMOTE', remoteSurveyId: 's1' },
      changed: true,
      convertedFromInPerson: false,
    });
  });

  it('제출 전 자료·다른 요청 자료·자료 없음은 거부', () => {
    expect(planRemoteSiteVisit(estimate(), { ...submitted, status: 'DRAFT' }, [], NOW).ok).toBe(
      false,
    );
    expect(planRemoteSiteVisit(estimate(), { ...submitted, requestId: 'r2' }, [], NOW).ok).toBe(
      false,
    );
    expect(planRemoteSiteVisit(estimate(), undefined, [], NOW).ok).toBe(false);
  });

  it('확정·마감된 견적은 바꾸지 않는다', () => {
    const final = { amount: 1, createdAt: NOW };
    expect(planRemoteSiteVisit(estimate({ final }), submitted, [], NOW).ok).toBe(false);
    expect(planRemoteSiteVisit(estimate({ stage: 'DECLINED' }), submitted, [], NOW).ok).toBe(false);
  });

  it('실사 상한이 차 있으면 새로 잡지 않는다', () => {
    const full = ['a', 'b', 'c'].map((id) =>
      estimate({ id, stage: 'VISIT_SCHEDULED', visit: { scheduledAt: NOW } }),
    );
    expect(planRemoteSiteVisit(estimate(), submitted, full, NOW).ok).toBe(false);
  });

  it('방문 실사는 일시를 두고 원격으로 바꾸며 바뀌었다고 표시한다', () => {
    const visit = { scheduledAt: '2026-10-20T00:00:00.000Z' };
    const plan = planRemoteSiteVisit(estimate({ visit }), submitted, [], NOW);
    expect(plan).toMatchObject({
      ok: true,
      visit: { scheduledAt: visit.scheduledAt, mode: 'REMOTE', remoteSurveyId: 's1' },
      convertedFromInPerson: true,
    });
  });

  it('영상통화 원격 실사에는 통화 id 를 두고 패키지 id 만 붙인다, 이미 붙어 있으면 그대로', () => {
    const visit = { scheduledAt: NOW, mode: 'REMOTE' as const, videoSessionId: 'v1' };
    const plan = planRemoteSiteVisit(estimate({ visit }), submitted, [], NOW);
    expect(plan).toMatchObject({
      ok: true,
      visit: { videoSessionId: 'v1', remoteSurveyId: 's1' },
      changed: true,
      convertedFromInPerson: false,
    });
    const again = planRemoteSiteVisit(
      estimate({ visit: { ...visit, remoteSurveyId: 's1' } }),
      submitted,
      [],
      NOW,
    );
    expect(again).toMatchObject({ ok: true, changed: false });
  });
});
