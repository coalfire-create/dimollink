import {
  ASBESTOS_BAN_YEAR,
  approvalYear,
  asbestosRisk,
  type BuildingLedgerInfo,
} from './building-ledger.js';
import {
  remoteSurveyAsbestosSuspected,
  type RemoteSurvey,
  type RemoteSurveyItemId,
} from './remote-survey.js';

/**
 * 현장 위험 신호 — 업체가 가상 현장(원격 실사 검토)을 열자마자 **금액을 크게 흔드는 것**부터 본다.
 *
 * 현장에 가면 업체는 지붕·지하·진입로·전깃줄·옆 건물을 먼저 본다. 원격에서는 그 정보가
 * 질문지·사진·건축물대장에 흩어져 있어서, 한 곳에 모으지 않으면 놓친다.
 * 판정은 기존 판정 함수([[remote-survey]] remoteSurveyAsbestosSuspected, [[building-ledger]]
 * asbestosRisk)를 그대로 쓰고, 여기서는 **모아서 순서만 정한다** — 새 계수는 없다.
 *
 * 등급:
 *  - `DANGER`: 금액·절차가 크게 달라지는 것(석면 신고, 지하 되메우기, 장비 진입 불가).
 *  - `CHECK`: 사진으로 직접 확인해야 하는 것(전깃줄, 옆 건물 간격, 남은 짐).
 */

export type SiteRiskLevel = 'DANGER' | 'CHECK';

export type SiteRiskId =
  'ASBESTOS' | 'BASEMENT' | 'NARROW_ACCESS' | 'OVERHEAD_WIRES' | 'NEIGHBOR_GAP' | 'NOT_EMPTY';

export interface SiteRiskFlag {
  id: SiteRiskId;
  level: SiteRiskLevel;
  title: string;
  /** 왜 이 신호가 떴는가 — 근거(질문지/대장/사진)를 함께 적는다. */
  detail: string;
  /** 근거 사진이 있는 체크리스트 항목(사진 탭에서 바로 찾게). */
  itemId?: RemoteSurveyItemId;
}

/** 판정에 필요한 패키지 필드만 — 제출 전·후 어느 쪽이든 받는다. */
export type SiteRiskSurveyInput = Pick<RemoteSurvey, 'answers' | 'items'>;

function photoCount(survey: SiteRiskSurveyInput | null, id: RemoteSurveyItemId): number {
  return survey?.items[id]?.length ?? 0;
}

/**
 * 위험 신호 목록. DANGER 가 먼저, 같은 등급 안에서는 업체가 현장에서 보는 순서(밖 → 안 → 주변).
 * 패키지가 없어도(대장만 있어도) 낼 수 있는 것은 낸다 — 개산 단계에서도 쓸모가 있다.
 */
export function buildSiteRiskFlags(
  survey: SiteRiskSurveyInput | null,
  ledger: BuildingLedgerInfo | null | undefined,
): SiteRiskFlag[] {
  const flags: SiteRiskFlag[] = [];
  const answers = survey?.answers ?? {};

  // 석면 — 해체 신고·전문업체·처리비가 통째로 달라져 가장 먼저 띄운다.
  // 소비자 답(슬레이트·들은 적 있음)과 대장(사용승인 연도·지붕재)을 둘 다 본다.
  const ledgerRisk = asbestosRisk(ledger);
  const reasons: string[] = [];
  if (answers.roofType === 'SLATE') reasons.push('지붕이 슬레이트라고 답함');
  if (answers.knownAsbestos === 'YES') reasons.push('석면이 있다고 들었다고 답함');
  if (ledgerRisk === 'HIGH' || ledgerRisk === 'POSSIBLE') {
    // 연도가 있으면 그대로 보여준다 — "몇 년 건물인가"가 업체가 가장 먼저 묻는 것이다.
    const year = approvalYear(ledger?.useAprDay);
    reasons.push(
      year !== undefined && year <= ASBESTOS_BAN_YEAR
        ? `건축물대장 사용승인 ${year}년(석면 금지 ${ASBESTOS_BAN_YEAR}년 이전)`
        : '건축물대장 지붕재 슬레이트',
    );
  }
  // 판정 기준은 remoteSurveyAsbestosSuspected 가 정한다 — 기준이 늘어도 신호가 빠지지 않게.
  if (remoteSurveyAsbestosSuspected(answers) && reasons.length === 0) {
    reasons.push('신청자 답변');
  }
  if (reasons.length > 0) {
    flags.push({
      id: 'ASBESTOS',
      level: 'DANGER',
      title: '석면 의심',
      detail: `${reasons.join(' · ')}. 지붕·천장·바닥 사진을 확인하세요.`,
      itemId: 'ROOF',
    });
  }

  // 지하 — 되메우기·흙막이로 금액 차이가 가장 크다. 대장에 지하층이 있으면 답과 무관하게 띄운다.
  const ledgerBasement = typeof ledger?.ugrndFlrCnt === 'number' && ledger.ugrndFlrCnt > 0;
  if (answers.basement === 'YES' || ledgerBasement) {
    flags.push({
      id: 'BASEMENT',
      level: 'DANGER',
      title: '지하층 있음',
      detail: ledgerBasement
        ? `건축물대장 지하 ${ledger!.ugrndFlrCnt}층. 되메우기·흙막이 필요 여부를 확인하세요.`
        : '신청자가 지하가 있다고 답함. 되메우기·흙막이 필요 여부를 확인하세요.',
      itemId: 'BASEMENT_ENTRANCE',
    });
  } else if (answers.basement === 'UNKNOWN') {
    flags.push({
      id: 'BASEMENT',
      level: 'CHECK',
      title: '지하 여부 모름',
      detail: '신청자가 지하 여부를 모른다고 답함. 외부 사진·영상통화로 확인하세요.',
      itemId: 'EXTERIOR',
    });
  }

  // 진입로 — 2m 미만이면 굴착기·덤프가 못 들어가 인력·소형 장비로 바뀐다(구간 경계는
  // [[remote-survey]] AccessWidthBucket 주석의 장비 기준). 2~3m 는 소형 장비만 된다.
  if (answers.accessWidth === 'UNDER_2M' || answers.accessWidth === 'FROM_2M_TO_3M') {
    const narrowest = answers.accessWidth === 'UNDER_2M';
    flags.push({
      id: 'NARROW_ACCESS',
      level: narrowest ? 'DANGER' : 'CHECK',
      title: narrowest ? '진입로 2m 미만' : '진입로 2~3m',
      detail: narrowest
        ? '장비가 못 들어갈 수 있어요. 인력·소형 장비 기준으로 보세요.'
        : '소형 굴착기·1톤 트럭 기준입니다. 가장 좁은 곳 사진을 확인하세요.',
      itemId: 'ACCESS_ROAD',
    });
  }

  // 전깃줄 — 선택 항목이라, 소비자가 찍어 보냈다는 것 자체가 "있다"는 신호다.
  const wires = photoCount(survey, 'OVERHEAD_WIRES');
  if (wires > 0) {
    flags.push({
      id: 'OVERHEAD_WIRES',
      level: 'CHECK',
      title: '전깃줄·통신선',
      detail: `사진 ${wires}장. 장비 작업 반경과 한전 이설·보호 요청 필요 여부를 보세요.`,
      itemId: 'OVERHEAD_WIRES',
    });
  }

  // 옆 건물 간격 — 필수 항목이라 항상 찍혀 오지만, 판단(방음벽·비계·인접 보호)은 사진으로만 된다.
  const gap = photoCount(survey, 'NEIGHBOR_GAP');
  if (gap > 0) {
    flags.push({
      id: 'NEIGHBOR_GAP',
      level: 'CHECK',
      title: '옆 건물과의 간격',
      detail: `사진 ${gap}장. 가설 방음벽·비계와 인접 건물 보호 비용을 판단하세요.`,
      itemId: 'NEIGHBOR_GAP',
    });
  }

  // 남은 짐 — 생활폐기물 처리가 따로 붙는다(건설폐기물과 처리 경로가 다르다).
  if (answers.buildingEmpty === false) {
    flags.push({
      id: 'NOT_EMPTY',
      level: 'CHECK',
      title: '건물에 짐이 남아 있음',
      detail: '생활폐기물 처리가 따로 필요합니다. 방 사진으로 양을 보세요.',
      itemId: 'ROOMS',
    });
  }

  return [
    ...flags.filter((f) => f.level === 'DANGER'),
    ...flags.filter((f) => f.level === 'CHECK'),
  ];
}
