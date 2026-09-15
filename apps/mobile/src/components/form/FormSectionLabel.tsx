import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 폼 안의 소제목 — 입력 그룹의 이름.
 *
 * 화면 제목(SectionTitle)보다 작고 입력 바로 위에 붙는다. 폼 화면마다
 * `<Text style={styles.sectionLabel}>` 를 다시 정의하던 걸 한 곳으로 모은 것이다.
 */
export function FormSectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  /** 왼쪽에 붙일 아이콘(선택). */
  icon?: React.ReactNode;
}) {
  if (!icon) return <Text style={styles.label}>{children}</Text>;
  return (
    <View style={styles.row}>
      {icon}
      <Text style={[styles.label, styles.labelInline]}>{children}</Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  labelInline: {
    marginBottom: 0,
    marginLeft: theme.spacing.xs,
    marginTop: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
