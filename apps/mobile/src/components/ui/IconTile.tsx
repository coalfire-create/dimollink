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
  /** brand: 연한 브랜드 바탕 / solid: 진한 브랜드 바탕(강조) */
  tone?: 'brand' | 'solid';
  style?: StyleProp<ViewStyle>;
}) {
  const box = SIZES[size];
  const fg = tone === 'solid' ? colors.background : colors.primary;
  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: tone === 'solid' ? colors.primary : colors.primarySoft,
          borderRadius: box.radius,
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

/** 크기별 상자·아이콘·글자 — 상자는 8배수, 모서리는 상자의 약 30%(둥근 사각). */
const SIZES = {
  sm: { box: 40, radius: 12, icon: 22, font: font.body },
  md: { box: 48, radius: 14, icon: 26, font: font.bodyLarge },
  lg: { box: 64, radius: 20, icon: 34, font: font.title },
} as const;

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '800',
  },
});
