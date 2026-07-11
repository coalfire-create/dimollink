import type { ProviderRole, RequestKind, UserType } from '@dimol/shared';
import type { TabName } from './navigation';

/**
 * 가입 유형(userType)별 화면 구성.
 * 유형마다 홈에서 할 수 있는 동작·탭 구성·목록 성격이 달라, 여기서 한 곳에 정의해
 * HomeScreen·TabBar·RequestListScreen 이 공유한다.
 *
 * - 소비자(CONSUMER): 철거요청만 등록(배출자). 홈에 내가 올린 요청 진행 현황.
 * - 철거업체(DEMOLITION_COMPANY): 들어온 철거요청 수주(일감 피드) + 운반/처리 요청 등록.
 * - 운반업체(TRANSPORT_COMPANY): 콜대기(온라인/오프라인)로 운반 콜 수신·수락.
 * - 처리장(WASTE_TREATMENT_PLANT): 반입 예약 수신·수락.
 */

/** 홈 카드가 이동할 목적지. */
export type HomeActionRoute =
  | { name: 'requestForm'; kind: RequestKind }
  | { name: 'estimate' }
  | { name: 'siteAnalysis' }
  | { name: 'interiorForm' }
  | { name: 'interiorList'; scope: 'mine' | 'open' };

export interface HomeAction {
  key: string;
  icon: string;
  title: string;
  description: string;
  route: HomeActionRoute;
}

export interface RoleTab {
  tab: TabName;
  label: string;
  icon: string;
}

/** 업체 일감 피드(홈)에 쓰는 문구·동작 방식. */
export interface JobFeedLabels {
  openTitle: string;
  openEmpty: string;
  assignedTitle: string;
  assignedEmpty: string;
  acceptLabel: string;
  /**
   * 열린 일감 처리 방식:
   * - 'accept': 선착순 수락 + 금액 입력(철거/운반). 먼저 잡는 업체가 매칭.
   * - 'quote': 견적 제출(처리장). 여러 견적 중 요청자가 선택.
   */
  openMode: 'accept' | 'quote';
  /** 'quote' 모드에서 제출할 견적 party(처리장=DISPOSAL). */
  quoteParty?: ProviderRole;
}

export interface RoleConfig {
  /** 홈 상단 인사말 접미사. */
  homeGreetingSuffix: string;
  /** 동작(요청 등록/도구) 카드 섹션 제목. */
  homeIntro?: string;
  homeActions: HomeAction[];
  /** 운반업체 콜대기 카드 노출 여부. */
  showAvailability: boolean;
  /** 소비자 홈의 "내가 올린 요청" 섹션(있을 때만). */
  homeActive?: { title: string; empty: string };
  /** 업체 일감 피드(있을 때만). 없으면 소비자처럼 요청 등록 중심. */
  jobFeed?: JobFeedLabels;
  /** 참고 시세 대상. */
  marketRateParty?: ProviderRole;
  /** RequestListScreen(요청/작업 탭) 제목·빈 문구. */
  listTitle: string;
  listEmpty: string;
  /** 하단 탭 구성. */
  tabs: RoleTab[];
}

const TAB_HOME = (label: string): RoleTab => ({ tab: 'home', label, icon: '🏠' });
const TAB_REQUESTS = (label: string): RoleTab => ({ tab: 'requests', label, icon: '📋' });
const TAB_NOTI: RoleTab = { tab: 'notifications', label: '알림', icon: '🔔' };
const TAB_MYPAGE: RoleTab = { tab: 'mypage', label: '내 정보', icon: '👤' };
const ESTIMATE_ACTION: HomeAction = {
  key: 'estimate',
  icon: '📐',
  title: '폐기물 양 미리 계산',
  description: '건물 면적으로 대략적인 양을 알아봐요',
  route: { name: 'estimate' },
};
const SITE_ANALYSIS_ACTION: HomeAction = {
  key: 'siteAnalysis',
  icon: '📷',
  title: '현장 사진 분석',
  description: '사진으로 소재·철거 공정을 알아봐요',
  route: { name: 'siteAnalysis' },
};

export const ROLE_CONFIG: Record<UserType, RoleConfig> = {
  CONSUMER: {
    homeGreetingSuffix: '님, 안녕하세요',
    homeIntro: '무엇을 도와드릴까요?',
    homeActions: [
      {
        key: 'demolition',
        icon: '🏚️',
        title: '철거 요청',
        description: '건물·구조물 철거를 맡겨요',
        route: { name: 'requestForm', kind: 'DEMOLITION' },
      },
      SITE_ANALYSIS_ACTION,
      ESTIMATE_ACTION,
    ],
    showAvailability: false,
    homeActive: { title: '진행중인 요청', empty: '아직 요청이 없어요. 철거 요청을 시작해 보세요.' },
    marketRateParty: 'TRANSPORT',
    listTitle: '내 요청',
    listEmpty: '아직 요청이 없어요. 홈에서 철거 요청을 시작해 보세요.',
    tabs: [TAB_HOME('홈'), TAB_REQUESTS('내 요청'), TAB_NOTI, TAB_MYPAGE],
  },
  DEMOLITION_COMPANY: {
    homeGreetingSuffix: '님, 오늘도 안전 작업하세요',
    homeIntro: '철거 후 처리를 이어서 맡겨요',
    homeActions: [
      {
        key: 'transport',
        icon: '🚚',
        title: '운반 요청',
        description: '철거 폐기물 운반 차량을 불러요',
        route: { name: 'requestForm', kind: 'TRANSPORT' },
      },
      {
        key: 'disposal',
        icon: '♻️',
        title: '처리장 예약',
        description: '폐기물 반입 일정을 잡아요',
        route: { name: 'requestForm', kind: 'DISPOSAL_RESERVATION' },
      },
      SITE_ANALYSIS_ACTION,
      ESTIMATE_ACTION,
    ],
    showAvailability: false,
    jobFeed: {
      openTitle: '새 철거 요청',
      openEmpty: '지금 들어온 철거 요청이 없어요.',
      assignedTitle: '수주한 철거',
      assignedEmpty: '수주한 철거가 없어요.',
      acceptLabel: '수주하기',
      openMode: 'accept', // 선착순 + 금액 입력
    },
    marketRateParty: 'DISPOSAL',
    listTitle: '내 작업',
    listEmpty: '아직 등록한 운반·처리 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_REQUESTS('내 작업'), TAB_NOTI, TAB_MYPAGE],
  },
  TRANSPORT_COMPANY: {
    homeGreetingSuffix: '님, 콜을 받아볼까요?',
    homeActions: [],
    showAvailability: true,
    jobFeed: {
      openTitle: '들어온 운반 콜',
      openEmpty: '아직 들어온 콜이 없어요. 콜대기를 켜두면 요청이 들어와요.',
      assignedTitle: '수락한 콜',
      assignedEmpty: '수락한 콜이 없어요.',
      acceptLabel: '콜 수락',
      openMode: 'accept', // 선착순 + 금액 입력
    },
    marketRateParty: 'TRANSPORT',
    listTitle: '콜 내역',
    listEmpty: '콜 내역이 없어요.',
    tabs: [TAB_HOME('콜대기'), TAB_NOTI, TAB_MYPAGE],
  },
  WASTE_TREATMENT_PLANT: {
    homeGreetingSuffix: '님, 반입 현황을 확인하세요',
    homeActions: [],
    showAvailability: false,
    jobFeed: {
      openTitle: '새 반입 예약',
      openEmpty: '아직 들어온 반입 예약이 없어요.',
      assignedTitle: '확정된 반입',
      assignedEmpty: '확정된 반입이 없어요.',
      acceptLabel: '견적 제출',
      openMode: 'quote', // 여러 처리장이 견적 제출 → 요청자가 비교·선택
      quoteParty: 'DISPOSAL',
    },
    marketRateParty: 'DISPOSAL',
    listTitle: '반입 예약',
    listEmpty: '반입 예약이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
  // 인테리어 업체 — 소비자 시공 요청에 밀봉 입찰(파일럿 밖 · FEATURE_INTERIOR).
  // 폐기물 일감 피드(jobFeed)를 쓰지 않고, 전용 인테리어 일감 목록으로 이동한다.
  INTERIOR_COMPANY: {
    homeGreetingSuffix: '님, 새 시공 요청을 확인하세요',
    homeIntro: '인테리어 일감',
    homeActions: [
      {
        key: 'interiorOpen',
        icon: '🛠️',
        title: '들어온 시공 요청',
        description: '요청을 보고 비밀 견적을 넣어요',
        route: { name: 'interiorList', scope: 'open' },
      },
    ],
    showAvailability: false,
    listTitle: '시공 요청',
    listEmpty: '들어온 시공 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
};
