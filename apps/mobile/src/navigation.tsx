import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GeoPoint, RequestKind, UserProfile, WasteItem } from '@dimol/shared';
import { AppIcon } from './components/AppIcon';
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
export function TabBar({ active }: { active: TabName }) {
  const nav = useNavigation();
  const user = useSession();
  const insets = useSafeAreaInsets();
  const tabs = ROLE_CONFIG[user.userType]?.tabs ?? ROLE_CONFIG.CONSUMER.tabs;
  return (
    // 홈 인디케이터(아이폰) / 제스처 바(안드로이드) 위로 탭을 띄운다.
    // 고정값으로 두면 기기에 따라 탭 라벨이 인디케이터에 깔린다.
    <View style={[styles.tabBar, { paddingBottom: insets.bottom + spacing.xs }]}>
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
            {isActive ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorPlaceholder} />}
            <View style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}>
              <AppIcon name={icon} size={22} color={isActive ? colors.primary : colors.textMuted} filled={isActive} />
            </View>
            <Text numberOfLines={1} style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 화면 헤더 (푸시 화면은 뒤로가기 노출)
export function ScreenHeader({ title, canGoBack }: { title: string; canGoBack?: boolean }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    // 노치·상태바 아래로 제목을 내린다(고정 8px 이면 상태바에 제목이 깔린다).
    <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
      {canGoBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={() => nav.pop()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>← 뒤로</Text>
        </Pressable>
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.headerTitle, !canGoBack && styles.headerTitleCentered]}
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
    // Subtle upward shadow
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: touch.primaryButtonHeight + spacing.xs,
    paddingVertical: spacing.xs,
  },
  tabIndicator: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 3,
    width: 24,
  },
  tabIndicatorPlaceholder: {
    height: 3,
    width: 24,
  },
  tabIconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  tabIconWrapActive: {
    backgroundColor: colors.primarySoft,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: font.tabLabel,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: touch.primaryButtonHeight + spacing.xs,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    // paddingTop 은 안전영역에 맞춰 런타임에 정한다.
    // Subtle downward shadow
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: touch.minButtonHeight,
    justifyContent: 'center',
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  backLabel: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  headerTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.title,
    fontWeight: '800',
  },
  headerTitleCentered: {
    flex: 1,
    textAlign: 'center',
  },
});
