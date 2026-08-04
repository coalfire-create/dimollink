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


export interface RoleTab {
  tab: TabName;
  label: string;
  icon: string;
}


export interface RoleConfig {
  /** 홈 상단 인사말 접미사. */
  homeGreetingSuffix: string;
  /** 동작(요청 등록/도구) 카드 섹션 제목. */
  homeIntro?: string;
  /** 소비자 홈의 "내가 올린 요청" 섹션(있을 때만). */
  homeActive?: { title: string; empty: string };
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

export const ROLE_CONFIG: Record<UserType, RoleConfig> = {
  CONSUMER: {
    homeGreetingSuffix: '님',
    homeIntro: '무엇을 도와드릴까요?',
    homeActive: { title: '진행중인 요청', empty: '아직 요청이 없어요. 철거 요청을 시작해 보세요.' },
    marketRateParty: 'TRANSPORT',
    listTitle: '내 요청',
    listEmpty: '아직 요청이 없어요. 홈에서 철거 요청을 시작해 보세요.',
    tabs: [
      { tab: 'home', label: '홈', icon: '🏠' },
      { tab: 'requests', label: '이용내역', icon: '📋' },
      { tab: 'notifications', label: '알림', icon: '🔔' },
      { tab: 'mypage', label: '마이페이지', icon: '👤' },
    ],
  },
  DEMOLITION_COMPANY: {
    homeGreetingSuffix: '님, 오늘도 안전 작업하세요',
    homeIntro: '철거 후 처리를 이어서 맡겨요',
    marketRateParty: 'DISPOSAL',
    listTitle: '내 작업',
    listEmpty: '아직 등록한 운반·처리 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_REQUESTS('내 작업'), TAB_NOTI, TAB_MYPAGE],
  },
  TRANSPORT_COMPANY: {
    homeGreetingSuffix: '님, 콜을 받아볼까요?',
    marketRateParty: 'TRANSPORT',
    listTitle: '콜 내역',
    listEmpty: '콜 내역이 없어요.',
    tabs: [TAB_HOME('콜대기'), TAB_NOTI, TAB_MYPAGE],
  },
  WASTE_TREATMENT_PLANT: {
    homeGreetingSuffix: '님, 반입 현황을 확인하세요',
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
    listTitle: '시공 요청',
    listEmpty: '들어온 시공 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
};
