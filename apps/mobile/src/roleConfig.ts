import type { ProviderRole, RequestKind, UserType } from '@dimol/shared';
import type { TabName } from './navigation';
import type { IconName } from './components/AppIcon';

export interface RoleTab {
  tab: TabName;
  label: string;
  icon: IconName;
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

const TAB_HOME = (label: string): RoleTab => ({ tab: 'home', label, icon: 'home' });
const TAB_REQUESTS = (label: string): RoleTab => ({ tab: 'requests', label, icon: 'requests' });
const TAB_NOTI: RoleTab = { tab: 'notifications', label: '알림', icon: 'notifications' };
const TAB_MYPAGE: RoleTab = { tab: 'mypage', label: '내 정보', icon: 'mypage' };

export const ROLE_CONFIG: Record<UserType, RoleConfig> = {
  CONSUMER: {
    homeGreetingSuffix: '님',
    homeIntro: '무엇을 도와드릴까요?',
    homeActive: { title: '진행중인 요청', empty: '아직 요청이 없어요. 철거 요청을 시작해 보세요.' },
    marketRateParty: 'TRANSPORT',
    listTitle: '내 요청',
    listEmpty: '아직 요청이 없어요. 홈에서 철거 요청을 시작해 보세요.',
    tabs: [
      { tab: 'home', label: '홈', icon: 'home' },
      { tab: 'requests', label: '이용내역', icon: 'requests' },
      { tab: 'notifications', label: '알림', icon: 'notifications' },
      { tab: 'mypage', label: '마이페이지', icon: 'mypage' },
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
  INTERIOR_COMPANY: {
    homeGreetingSuffix: '님, 새 시공 요청을 확인하세요',
    homeIntro: '인테리어 일감',
    listTitle: '시공 요청',
    listEmpty: '들어온 시공 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
};
