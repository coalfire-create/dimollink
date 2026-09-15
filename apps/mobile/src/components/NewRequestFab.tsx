import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { ROLE_CONFIG } from '../roleConfig';
import { useNavigation, useSession } from '../navigation';
import { AppIcon } from './AppIcon';
import { PressableScale } from './motion';
import { theme } from '../theme';

/**
 * 전역 "새 요청" 버튼 — 웹의 GNB 상단 주요 버튼에 해당하는 자리.
 *
 * 새 요청은 이 앱에서 사용자가 가장 자주 하는 단 하나의 동작인데, 지금까지는 홈 화면의
 * 카드에서만 시작할 수 있었다. 알림이나 상세를 보다가 새로 하나 넣으려면 홈으로 돌아가야
 * 했다는 뜻이다. 그래서 화면 위에 띄워 어디서든 한 번에 시작하게 한다.
 *
 * - 요청을 만드는 역할(배출자·철거업체)에만 보인다(roleConfig.primaryAction).
 * - 고객센터 버튼과 세로로 겹치지 않게 그 위에 둔다.
 * - 라벨을 붙인 확장형 — 아이콘만 있으면 고령 사용자가 무슨 버튼인지 알 수 없다.
 */
export function NewRequestFab() {
  const nav = useNavigation();
  const user = useSession();
  const action = ROLE_CONFIG[user.userType]?.primaryAction;
  if (!action) return null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => nav.push({ name: 'requestForm', kind: action.kind })}
      style={styles.fab}
    >
      <AppIcon name="hammer" size={20} color={theme.colors.background} />
      <Text style={styles.label}>{action.label}</Text>
    </PressableScale>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    bottom: Platform.OS === 'ios' ? 168 : 160, // 고객센터 버튼(96) 위.
    flexDirection: 'row',
    gap: spacing.xs / 2,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
    right: spacing.md,
    zIndex: 50,
    ...theme.shadow.primary,
  },
  label: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
  },
});
