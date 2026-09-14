import type { ProviderRole, UserType } from '@dimol/shared';
import type { TabName } from './navigation';
import type { IconName } from './components/AppIcon';

export interface RoleTab {
  tab: TabName;
  label: string;
  icon: IconName;
}

export interface RoleConfig {
  /**
   * 홈 상단 헤더에 붙는 인사말 접미사.
   *
   * 헤더는 제목(24px) 한 줄이라 업체명이 길면 "○○운반(주)님, 콜을 받아볼까요?" 가
   * 그대로 잘린다. 여기에는 **'님' 정도의 짧은 호칭만** 두고, 역할별 인사말은
   * 화면 안 배너에 둔다.
   */
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
    listEmpty: '철거·원상복구를 신청하면 진행 상황이 여기에 쌓여요.',
    // 라벨은 4글자 이하로 — 탭 4개가 한 줄에 들어가야 작은 화면에서 안 잘린다.
    tabs: [TAB_HOME('홈'), TAB_REQUESTS('이용내역'), TAB_NOTI, TAB_MYPAGE],
  },
  DEMOLITION_COMPANY: {
    homeGreetingSuffix: '님',
    homeIntro: '철거 후 처리를 이어서 맡겨요',
    marketRateParty: 'DISPOSAL',
    listTitle: '내 작업',
    listEmpty: '운반·처리 요청을 등록하면 여기에서 진행 상황을 볼 수 있어요.',
    tabs: [TAB_HOME('홈'), TAB_REQUESTS('내 작업'), TAB_NOTI, TAB_MYPAGE],
  },
  TRANSPORT_COMPANY: {
    homeGreetingSuffix: '님',
    marketRateParty: 'TRANSPORT',
    listTitle: '콜 내역',
    listEmpty: '콜대기를 켜 두면 주변 일감이 도착할 때 여기에 쌓여요.',
    tabs: [TAB_HOME('콜대기'), TAB_NOTI, TAB_MYPAGE],
  },
  WASTE_TREATMENT_PLANT: {
    homeGreetingSuffix: '님',
    marketRateParty: 'DISPOSAL',
    listTitle: '반입 예약',
    listEmpty: '반입 예약이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
  INTERIOR_COMPANY: {
    homeGreetingSuffix: '님',
    homeIntro: '인테리어 일감',
    listTitle: '시공 요청',
    listEmpty: '들어온 시공 요청이 없어요.',
    tabs: [TAB_HOME('홈'), TAB_NOTI, TAB_MYPAGE],
  },
};
