import React, { createContext, useContext } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { RequestKind, UserProfile } from '@dimol/shared';
import { ROLE_CONFIG } from './roleConfig';
import { theme } from './theme';

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
  | { name: 'requestForm'; kind: RequestKind }
  | { name: 'requestDetail'; requestId: string }
  | { name: 'chat'; requestId: string; counterpartyId: string }
  | { name: 'payment'; requestId: string; source?: 'waste' | 'interior' }
  | { name: 'estimate' }
  | { name: 'siteAnalysis' }
  // 인테리어 밀봉 역경매 (파일럿 밖 · FEATURE_INTERIOR)
  | { name: 'interiorForm' }
  | { name: 'interiorList'; scope: 'mine' | 'open' }
  | { name: 'interiorDetail'; requestId: string };

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
  const tabs = ROLE_CONFIG[user.userType]?.tabs ?? ROLE_CONFIG.CONSUMER.tabs;
  return (
    <View style={styles.tabBar}>
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
              <Text style={styles.tabIcon}>{icon}</Text>
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── 화면 헤더 (푸시 화면은 뒤로가기 노출)
export function ScreenHeader({ title, canGoBack }: { title: string; canGoBack?: boolean }) {
  const nav = useNavigation();
  return (
    <View style={styles.header}>
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
      <Text style={[styles.headerTitle, !canGoBack && styles.headerTitleCentered]}>{title}</Text>
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
    paddingBottom: Platform.OS === 'ios' ? 12 : spacing.xs,
    // Subtle upward shadow
    shadowColor: '#000',
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
    marginBottom: 4,
    width: 24,
  },
  tabIndicatorPlaceholder: {
    height: 3,
    marginBottom: 4,
    width: 24,
  },
  tabIconWrap: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    marginBottom: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tabIconWrapActive: {
    backgroundColor: colors.primarySoft,
  },
  tabIcon: {
    fontSize: font.bodyLarge,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    // Subtle downward shadow
    shadowColor: '#000',
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
