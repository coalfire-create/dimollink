import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon, type IconName } from '../AppIcon';
import { theme } from '../../theme';

/**
 * 아이콘 타일 — 글 앞에 붙는 아이콘은 전부 이 모양 하나로.
 *
 * 예전에는 화면마다 연한 원 안에 가는 선 아이콘(망치·트럭…)을 각자 그렸다. 원 크기·색·
 * 선 굵기가 제각각이라 같은 앱인데 화면마다 다른 앱처럼 보였고, 가는 선은 고령 사용자에게
 * 잘 안 보였다. 둥근 사각 타일 + 꽉 찬 아이콘 하나로 통일한다(큰 앱들이 쓰는 방식).
 *
 * `label` 을 주면 아이콘 대신 글자 한 자(업체 이름 첫 글자 등)를 넣는다 — 업체 목록에
 * 모든 줄이 같은 망치였던 걸, 업체마다 다른 머리글자로 구분되게 했다.
 */
export function IconTile({
  icon,
  label,
  size = 'md',
  tone = 'brand',
  style,
}: {
  icon?: IconName;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** brand: 연한 브랜드 바탕 / solid: 진한 브랜드 바탕 / neutral: 차분한 웜 스톤 바탕 */
  tone?: 'brand' | 'solid' | 'neutral';
  style?: StyleProp<ViewStyle>;
}) {
  const box = SIZES[size];
  const bg =
    tone === 'solid'
      ? colors.primary
      : tone === 'neutral'
        ? colors.surface
        : colors.primarySoft;
  const fg =
    tone === 'solid'
      ? colors.background
      : tone === 'neutral'
        ? colors.text
        : colors.primary;
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: bg,
          borderColor: tone === 'neutral' ? colors.border : 'transparent',
          borderRadius: box.radius,
          borderWidth: tone === 'neutral' ? 1 : 0,
          height: box.box,
          width: box.box,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {label ? (
        <Text style={[styles.label, { color: fg, fontSize: box.font }]}>{label}</Text>
      ) : icon ? (
        <AppIcon name={icon} size={box.icon} color={fg} filled />
      ) : null}
    </View>
  );
}

const { colors, font } = theme;

/** 크기별 상자·아이콘·글자 — 정돈된 건축적 코너(8~14px). */
const SIZES = {
  sm: { box: 40, radius: 8, icon: 20, font: font.body },
  md: { box: 48, radius: 10, icon: 24, font: font.bodyLarge },
  lg: { box: 64, radius: 14, icon: 32, font: font.title },
} as const;

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
