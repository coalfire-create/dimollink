import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './ui';
import { AppIcon, type IconName } from './AppIcon';
import { theme } from '../theme';

/**
 * 메뉴 목록 — 아이콘 + 제목(+보조 문구) + 화살표로 된 이동 줄의 묶음.
 *
 * 마이페이지·설정처럼 "여기서 어디로 갈 수 있는지"를 늘어놓는 화면의 기본 단위다.
 * 줄마다 Pressable·아이콘 원·구분선을 손으로 짜면 화면마다 간격과 터치 영역이
 * 조금씩 달라진다. 여기 한 곳에 두면 48px 터치 영역과 구분선 규칙이 저절로 지켜진다.
 *
 * 조건부로 빠지는 줄(업체 전용·관리자 전용)이 있어서 항목을 배열로 받는다 —
 * JSX 안에서 구분선을 조건부로 끼워 넣다 보면 맨 끝에 줄 하나가 남는 실수가 난다.
 */
export interface MenuItem {
  key: string;
  icon: IconName;
  label: string;
  /** 두 번째 줄(전화번호 등). */
  subLabel?: string;
  onPress: () => void;
  /** 접근성 라벨(기본값은 label). */
  accessibilityLabel?: string;
}

export function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <Card style={styles.group}>
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            style={styles.item}
            onPress={item.onPress}
          >
            <View style={styles.left}>
              <View style={styles.iconCircle}>
                <AppIcon name={item.icon} size={18} color={theme.colors.primary} />
              </View>
              <View style={styles.labelBox}>
                <Text style={styles.label}>{item.label}</Text>
                {item.subLabel ? <Text style={styles.subLabel}>{item.subLabel}</Text> : null}
              </View>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </React.Fragment>
      ))}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  labelBox: {
    flexShrink: 1,
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: 20,
    // Card 가 좌우로도 16 을 주는데 줄(item)이 자기 16 을 또 주고, 구분선이 거기서 다시
    // 16 을 들어가 내용이 세 겹으로 밀려 있었다. 좌우 여백은 줄이 정한다.
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  label: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
  },
  subLabel: {
    fontSize: font.caption,
    color: colors.textMuted,
    marginTop: spacing.xs / 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  arrow: {
    fontSize: font.titleLarge,
    color: colors.textMuted,
  },
});
