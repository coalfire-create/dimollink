import React, { createContext, useContext } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GeoPoint, RequestKind, UserProfile, WasteItem } from '@dimol/shared';
import { USER_TYPE_LABELS } from '@dimol/shared';
import brandmark from '../assets/brandmark.png';
import { AppIcon } from './components/AppIcon';
import { useWideLayout } from './lib/layout';
import { ROLE_CONFIG } from './roleConfig';
import { theme } from './theme';

/**
 * 요청 폼 프리필 — 다른 요청(처리장 예약)이나 사진 AI 분석 결과에서
 * 소재/좌표/연결 요청 id 를 넘겨 요청 폼을 미리 채운다.
 */
export interface RequestFormPrefill {
  wasteItems?: WasteItem[];
  wasteTons?: number;
  region?: string;
  location?: GeoPoint;
  loadAddress?: string;
  unloadAddress?: string;
  /** 철거 현장 주소 — 디몰비전에서 지도로 찝은 주소를 그대로 넘겨받는다. */
  siteAddress?: string;
  /** 철거 상세 폼 용 프리필 */
  spaceSize?: string;
  floorCount?: string;
  buildingType?: string;
  /** 연결된 요청 id(예약↔운반 세트). */
  linkedRequestId?: string;
}

/**
 * 경량 내비게이션 — 탭 4개 + 푸시 스택.
 * 파일럿 화면 수(9개)에는 외부 내비게이션 라이브러리 없이 이 구조로 충분하며,
 * 화면이 늘어나면 route 타입을 유지한 채 react-navigation 으로 교체한다.
 */

export type Route =
  | { name: 'home' }
  | { name: 'requests' }
  | { name: 'notifications' }
  | { name: 'mypage' }
  | { name: 'requestForm'; kind: RequestKind; prefill?: RequestFormPrefill }
  | { name: 'requestDetail'; requestId: string }
  | { name: 'chat'; requestId: string; counterpartyId: string }
  | { name: 'payment'; requestId: string; source?: 'waste' | 'interior' }
  | { name: 'estimate' }
  // 철거업체가 요청 하나를 놓고 견적을 산정하는 화면(현장 브리핑 + 금액 입력).
  | { name: 'estimateWorksheet'; requestId: string }
  // 철거업체가 현장에 가지 않고 원격 실사 자료로 현장을 보는 "가상 현장"(개요·사진·3D·영상통화·확정).
  | { name: 'virtualSite'; requestId: string }
  // 소비자가 업체 방문 없이 현장을 보여주는 원격 실사 촬영(체크리스트·질문·추가 촬영 요청).
  | { name: 'remoteSurvey'; requestId: string }
  | { name: 'siteAnalysis' }
  // 인테리어 밀봉 역경매 (파일럿 밖 · FEATURE_INTERIOR)
  | { name: 'interiorForm' }
  | { name: 'interiorList'; scope: 'mine' | 'open' }
  | { name: 'interiorDetail'; requestId: string }
  | { name: 'reviewForm'; requestId: string }
  | { name: 'tracking'; requestId: string }
  // 관리자 백오피스. **로그인한 채로** 들어가야 세션으로 인증되고 감사 로그에 사람이 남는다.
  // (로그아웃 상태의 진입 경로는 공유 운영 토큰용으로 웰컴 화면에 따로 있다.)
  | { name: 'admin' }
  // 앱 안에서 실제로 결제되는 상품(일반결제 1건 · 월 정기결제 1건).
  | { name: 'store' }
  // 업체 정산 계좌. 등록·실명확인 전에는 정산금이 지급되지 않는다.
  | { name: 'payoutAccount' };

export type TabName = 'home' | 'requests' | 'notifications' | 'mypage';

export interface Navigation {
  push: (route: Route) => void;
  pop: () => void;
  switchTab: (tab: TabName) => void;
  /**
   * 이탈 가드 — 지금 화면을 떠나기 전에 한 번 끼어든다.
   *
   * 작성 중인 폼처럼 나가면 잃는 게 있는 화면이 등록한다. guard 가 true 를 돌려주면
   * 화면 전환을 멈춘다(보통 확인 모달을 띄운다). 가드는 **원래 가려던 이동**(proceed)을
   * 그대로 받으므로, 사용자가 "나가기"를 고르면 눌렀던 그 목적지로 간다 —
   * 뒤로가기든, 브레드크럼이든, 탭 전환이든.
   *
   * 뒤로가기 버튼과 안드로이드 하드웨어 back 이 같은 가드를 지나가도록 내비게이션에 둔다 —
   * 화면마다 따로 막으면 한쪽 경로가 반드시 빠진다.
   */
  setLeaveGuard: (guard: LeaveGuard | null) => void;
}

/** 이탈 가드. 이동을 멈추려면 true 를, 그대로 보내려면 false 를 돌려준다. */
export type LeaveGuard = (proceed: () => void) => boolean;

/**
 * 이탈 가드 등록 훅 — 화면이 사라질 때 자동으로 해제한다.
 * enabled 가 false 면(더 이상 지킬 게 없으면) 가드를 걸지 않는다.
 */
export function useLeaveGuard(enabled: boolean, guard: LeaveGuard): void {
  const nav = useNavigation();
  const guardRef = React.useRef(guard);
  guardRef.current = guard;
  React.useEffect(() => {
    if (!enabled) return;
    nav.setLeaveGuard((proceed) => guardRef.current(proceed));
    return () => nav.setLeaveGuard(null);
  }, [enabled, nav]);
}

export const NavigationContext = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error('NavigationContext 가 설정되지 않았습니다.');
  return nav;
}

// ── 세션 (로그인/회원가입 완료 후 회원 프로필 보관)
export const SessionContext = createContext<UserProfile | null>(null);

export function useSession(): UserProfile {
  const user = useContext(SessionContext);
  if (!user) throw new Error('SessionContext 가 설정되지 않았습니다.');
  return user;
}

// ── 인증 동작 (로그아웃 등) — 로그인한 회원 화면에서 사용
export interface AuthActions {
  logout: () => void;
}

export const AuthActionsContext = createContext<AuthActions | null>(null);

export function useAuthActions(): AuthActions {
  const actions = useContext(AuthActionsContext);
  if (!actions) throw new Error('AuthActionsContext 가 설정되지 않았습니다.');
  return actions;
}

// ── 하단 탭바 (가입 유형별 탭 구성이 다르다 — roleConfig 참조)
/**
 * 큰 서비스 앱들처럼 아이콘 + 글자만 둔다. 지금 탭은 꽉 찬 아이콘 + 먹색 굵은 글자,
 * 나머지는 빈 아이콘 + 회색 글자. 예전에는 위쪽 파란 막대 + 아이콘 뒤 파란 알약까지
 * 세 겹으로 강조해서 탭바가 화면 내용보다 더 시끄러웠다.
 */
export function TabBar({ active }: { active: TabName }) {
  const nav = useNavigation();
  const user = useSession();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  const tabs = ROLE_CONFIG[user.userType]?.tabs ?? ROLE_CONFIG.CONSUMER.tabs;
  // 데스크톱 웹은 하단 탭 대신 상단 메뉴바([[WebTopNav]])를 쓴다.
  if (wide) return null;
  return (
    // 홈 인디케이터(아이폰) / 제스처 바(안드로이드) 위로 탭을 띄운다.
    // 고정값으로 두면 기기에 따라 탭 라벨이 인디케이터에 깔린다.
    <View
      accessibilityRole="tablist"
      style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}
    >
      {tabs.map(({ tab, label, icon }) => {
        const isActive = tab === active;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => nav.switchTab(tab)}
            style={styles.tabItem}
          >
            <View style={[styles.tabIndicator, isActive && styles.tabIndicatorActive]} />
            <AppIcon
              name={icon}
              size={24}
              color={isActive ? colors.text : colors.textMuted}
              filled={isActive}
            />
            <Text numberOfLines={1} style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 데스크톱 웹 상단 메뉴바 — 하단 탭과 같은 탭 구성을 가로로 펼친다.
 * active 가 null 이면(푸시된 화면) 어느 탭도 강조하지 않는다. 탭을 누르면 스택을 비우고
 * 그 탭으로 간다(이탈 가드는 switchTab 이 그대로 지나간다).
 *
 * 오른쪽은 회사 사이트 머리처럼 [알림 아이콘 · 이름(내 정보로) · 로그아웃]. 알림·내 정보는
 * 탭에도 있지만, 웹 사용자는 오른쪽 위에서 계정을 찾는다.
 */
export function WebTopNav({ active }: { active: TabName | null }) {
  const nav = useNavigation();
  const user = useSession();
  const { logout } = useAuthActions();
  const tabs = ROLE_CONFIG[user.userType]?.tabs ?? ROLE_CONFIG.CONSUMER.tabs;
  const hasNoti = tabs.some((t) => t.tab === 'notifications');
  const roleLabel = USER_TYPE_LABELS[user.userType] ?? '';
  return (
    <View style={[styles.topNav, Platform.OS === 'web' && (styles.topNavSticky as ViewStyle)]}>
      <View style={styles.topNavInner}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="비움 홈"
          onPress={() => nav.switchTab('home')}
          style={styles.topNavBrand}
        >
          <Image source={brandmark} style={styles.topNavLogo} resizeMode="contain" />
          <Text style={styles.topNavBrandText}>비움</Text>
        </Pressable>
        <View style={styles.topNavTabs} accessibilityRole="tablist">
          {tabs.map(({ tab, label }) => (
            <TopNavTab
              key={tab}
              label={label}
              active={tab === active}
              onPress={() => nav.switchTab(tab)}
            />
          ))}
        </View>
        <View style={styles.topNavUser}>
          {hasNoti ? (
            <HoverPressable
              accessibilityRole="button"
              accessibilityLabel="알림"
              onPress={() => nav.switchTab('notifications')}
              style={styles.topNavIconButton}
              hoverStyle={styles.topNavHover}
            >
              <AppIcon
                name="notifications"
                size={24}
                color={active === 'notifications' ? colors.text : colors.textMuted}
                filled={active === 'notifications'}
              />
            </HoverPressable>
          ) : null}
          <HoverPressable
            accessibilityRole="link"
            accessibilityLabel={`${user.name}님, 내 정보`}
            onPress={() => nav.switchTab('mypage')}
            style={styles.topNavAccount}
            hoverStyle={styles.topNavHover}
          >
            <View style={styles.topNavAvatar}>
              <Text style={styles.topNavAvatarText}>{user.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.topNavAccountText}>
              <Text numberOfLines={1} style={styles.topNavUserName}>
                {user.name}님
              </Text>
              {roleLabel ? <Text style={styles.topNavUserRole}>{roleLabel}</Text> : null}
            </View>
          </HoverPressable>
          <View style={styles.topNavDivider} />
          <HoverPressable
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
            onPress={logout}
            style={styles.topNavLogout}
            hoverStyle={styles.topNavHover}
          >
            <Text style={styles.topNavLogoutLabel}>로그아웃</Text>
          </HoverPressable>
        </View>
      </View>
    </View>
  );
}

function TopNavTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.topNavTab, active && styles.topNavTabActive]}
    >
      <Text
        style={[
          styles.topNavTabLabel,
          (active || hovered) && styles.topNavTabLabelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 마우스를 올리면 hoverStyle 이 얹히는 Pressable — 웹 메뉴바의 작은 버튼들용. */
function HoverPressable({
  hoverStyle,
  style,
  children,
  ...rest
}: React.ComponentProps<typeof Pressable> & {
  hoverStyle: StyleProp<ViewStyle>;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      {...rest}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[style, hovered && hoverStyle]}
    >
      {children}
    </Pressable>
  );
}

// ── 화면 헤더 (푸시 화면은 뒤로가기 노출)
/**
 * 앱: 뒤로 가는 화면은 흰 띠 위에 [‹ 뒤로] + 제목, 탭 첫 화면은 바닥색 위 왼쪽 큰 제목.
 * 데스크톱 웹: 흰 띠 없이 본문 칸 위에 "페이지 제목"으로 놓는다 — 상단 메뉴바가 이미
 * 흰 띠라 그 아래 또 흰 띠가 겹치면 머리가 두 줄로 보였다.
 */
export function ScreenHeader({ title, canGoBack }: { title: string; canGoBack?: boolean }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  return (
    // 노치·상태바 아래로 제목을 내린다(고정 8px 이면 상태바에 제목이 깔린다).
    <View
      style={[
        styles.header,
        !canGoBack && styles.headerRoot,
        wide && styles.headerWide,
        { paddingTop: wide ? spacing.lg : insets.top + (canGoBack ? spacing.xs : spacing.md) },
      ]}
    >
      {canGoBack ? (
        <HoverPressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={() => nav.pop()}
          style={[styles.backButton, wide && styles.backButtonWide]}
          hoverStyle={styles.backButtonHover}
        >
          <AppIcon name="chevronLeft" size={24} color={colors.text} />
          <Text style={styles.backLabel}>뒤로</Text>
        </HoverPressable>
      ) : null}
      <Text
        numberOfLines={1}
        accessibilityRole="header"
        style={[
          styles.headerTitle,
          !canGoBack && styles.headerTitleRoot,
          wide && styles.headerTitleWide,
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

const { colors, font, spacing, touch } = theme;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    // paddingBottom 은 안전영역에 맞춰 런타임에 정한다.
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs / 2,
    justifyContent: 'center',
    minHeight: touch.primaryButtonHeight + spacing.xs,
    paddingBottom: spacing.xs / 2,
    paddingTop: spacing.xs / 2,
  },
  tabIndicator: {
    backgroundColor: 'transparent',
    borderRadius: 1,
    height: 2,
    marginBottom: spacing.xs / 2,
    width: 24,
  },
  tabIndicatorActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: font.tabLabel,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
  topNav: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    width: '100%',
    zIndex: 10,
  },
  topNavSticky: {
    position: 'sticky' as unknown as ViewStyle['position'],
    top: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  } as unknown as ViewStyle,
  topNavInner: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 72,
    maxWidth: theme.wideContentWidth,
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  topNavBrand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginRight: spacing.lg + spacing.sm,
    minHeight: touch.minButtonHeight,
  },
  topNavLogo: {
    height: 32,
    width: 32,
  },
  topNavBrandText: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  topNavTabs: {
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  topNavTab: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  topNavTabActive: {
    borderBottomColor: colors.primary,
  },
  topNavTabLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  topNavTabLabelActive: {
    color: colors.text,
    fontWeight: '700',
  },
  topNavUser: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: spacing.md,
  },
  topNavHover: {
    backgroundColor: colors.surface,
  },
  topNavIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.button,
    height: touch.minButtonHeight,
    justifyContent: 'center',
    width: touch.minButtonHeight,
  },
  topNavAccount: {
    alignItems: 'center',
    borderRadius: theme.radius.button,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.xs,
  },
  topNavAvatar: {
    alignItems: 'center',
    backgroundColor: theme.onDark.canvas,
    borderColor: theme.onDark.border,
    borderRadius: theme.radius.badge,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  topNavAvatarText: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '700',
  },
  topNavAccountText: {
    maxWidth: 240,
  },
  topNavUserName: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  topNavUserRole: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  topNavDivider: {
    backgroundColor: colors.border,
    height: spacing.md,
    marginHorizontal: spacing.xs,
    width: 1,
  },
  topNavLogout: {
    borderRadius: theme.radius.button,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  topNavLogoutLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: touch.primaryButtonHeight + spacing.xs,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    // paddingTop 은 안전영역에 맞춰 런타임에 정한다.
  },
  headerRoot: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  headerWide: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: theme.radius.button,
    flexDirection: 'row',
    height: touch.minButtonHeight,
    justifyContent: 'center',
    marginRight: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  backButtonHover: {
    backgroundColor: colors.surface,
  },
  backButtonWide: {
    marginBottom: spacing.xs,
    marginLeft: -spacing.xs,
  },
  backLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  headerTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.title,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
  },
  headerTitleRoot: {
    flex: 1,
    fontSize: font.titleLarge,
  },
  // 세로 배치(column)라 flex 를 주면 높이가 0 으로 접힌다 — 내용 크기 그대로 둔다.
  headerTitleWide: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    fontSize: font.titleLarge + 4,
  },
});
