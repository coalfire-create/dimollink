import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserType } from '@dimol/shared';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { FadeInUp, PressableScale } from '../../components/motion';
import { FEATURE_INTERIOR } from '../../featureFlags';
import { theme } from '../../theme';

/**
 * 가입 유형 선택 — 이 선택이 이후 모든 화면의 구성을 바꾼다(탭·홈·메뉴).
 *
 * 드롭다운이 아니라 카드로 늘어놓는 이유: 유형마다 "무엇을 할 수 있는지"가 다른데,
 * 이름만으로는 배출자와 철거업체 중 어느 쪽인지 헷갈리는 사용자가 실제로 많다.
 * 설명 한 줄이 같이 보여야 잘못 가입하지 않는다.
 */
interface RoleOption {
  type: UserType;
  title: string;
  description: string;
  iconName: IconName;
  badge?: string;
}

const TYPE_OPTIONS: RoleOption[] = [
  {
    type: 'CONSUMER',
    title: '소비자',
    description: '철거·폐기물 처리를 맡기고 싶어요',
    iconName: 'home',
    badge: '개인/기업',
  },
  {
    type: 'DEMOLITION_COMPANY',
    title: '철거업체',
    description: '철거 작업을 수주하고 싶어요',
    iconName: 'hammer',
    badge: '파트너',
  },
  {
    type: 'TRANSPORT_COMPANY',
    title: '운반업체',
    description: '폐기물 운반 콜을 받고 싶어요',
    iconName: 'truck',
    badge: '파트너',
  },
  {
    type: 'WASTE_TREATMENT_PLANT',
    title: '처리장',
    description: '폐기물 반입 예약을 받고 싶어요',
    iconName: 'building',
    badge: '파트너',
  },
  {
    type: 'INTERIOR_COMPANY',
    title: '인테리어 업체',
    description: '인테리어 시공 견적을 넣고 싶어요',
    iconName: 'palette',
    badge: '파트너',
  },
];

export function RoleSelector({
  value,
  onChange,
}: {
  value: UserType;
  onChange: (type: UserType) => void;
}) {
  // 인테리어 업체 가입은 파일럿 밖 — FEATURE_INTERIOR 가 켜졌을 때만 노출.
  const options = TYPE_OPTIONS.filter(
    (option) => FEATURE_INTERIOR || option.type !== 'INTERIOR_COMPANY',
  );

  return (
    <>
      {options.map((option, index) => {
        const selected = value === option.type;
        return (
          <FadeInUp key={option.type} delay={120 + index * 50}>
            <PressableScale
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.title} — ${option.description}`}
              onPress={() => onChange(option.type)}
              style={[styles.card, selected && styles.cardSelected]}
            >
              <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>
                <AppIcon
                  name={option.iconName}
                  size={22}
                  color={selected ? colors.primary : colors.text}
                  filled={selected}
                />
              </View>
              <View style={styles.info}>
                <View style={styles.headerRow}>
                  <Text style={[styles.title, selected && styles.titleSelected]}>
                    {option.title}
                  </Text>
                  {option.badge ? (
                    <View style={[styles.tagBadge, selected && styles.tagBadgeSelected]}>
                      <Text style={[styles.tagBadgeText, selected && styles.titleSelected]}>
                        {option.badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.description}>{option.description}</Text>
              </View>
              <View style={[styles.check, selected && styles.checkSelected]}>
                {selected ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </PressableScale>
          </FadeInUp>
        );
      })}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  titleSelected: {
    color: theme.colors.primary,
  },
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadow.card,
  },
  cardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  iconCircleSelected: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
  },
  info: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  tagBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: spacing.xs / 2,
  },
  tagBadgeSelected: {
    backgroundColor: colors.background,
  },
  tagBadgeText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  checkSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkMark: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
});
