import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useNativeDriver } from './motion';
import { theme } from '../theme';

/**
 * 스켈레톤 — 데이터를 기다리는 동안 "들어올 화면의 뼈대"를 먼저 그린다.
 *
 * 스피너 하나만 돌리면 데이터가 도착하는 순간 레이아웃이 통째로 바뀌며 화면이 튄다.
 * 뼈대를 먼저 깔아 두면 바뀌는 건 내용뿐이라 덜 깜빡이고 체감도 빠르다.
 * 그래서 스켈레톤의 모양은 실제 화면의 블록 배치와 같아야 의미가 있다.
 */

export function SkeletonBlock({
  width = '100%',
  height = 20,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.border,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** 카드 한 장 분량의 뼈대 — 목록 행에 재사용. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBlock width={48} height={48} radius={999} />
      <View style={styles.cardBody}>
        <SkeletonBlock width="55%" height={20} />
        <SkeletonBlock width="35%" height={18} style={styles.gapSm} />
        <SkeletonBlock width="70%" height={16} style={styles.gapXs} />
      </View>
    </View>
  );
}

/** 대시보드(요청 목록) 로딩 뼈대. */
export function RequestListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.listWrap} accessibilityLabel="목록을 불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

/**
 * 요청 상세 로딩 뼈대 — 실제 상세 화면의 블록 순서(타임라인 → 요약 카드 → 정보 행)를 따른다.
 */
export function RequestDetailSkeleton() {
  return (
    <View style={styles.detailWrap} accessibilityLabel="요청 정보를 불러오는 중">
      <View style={styles.panel}>
        <SkeletonBlock width="40%" height={22} />
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={styles.stepRow}>
            <SkeletonBlock width={20} height={20} radius={999} />
            <SkeletonBlock width="45%" height={18} style={styles.stepLabel} />
          </View>
        ))}
      </View>
      <View style={styles.panel}>
        <SkeletonBlock width="60%" height={24} />
        <SkeletonBlock width="30%" height={20} style={styles.gapSm} />
      </View>
      <View style={styles.panel}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={styles.infoRow}>
            <SkeletonBlock width="28%" height={18} />
            <SkeletonBlock width="40%" height={18} />
          </View>
        ))}
      </View>
    </View>
  );
}

const { colors, spacing, radius } = theme;

const styles = StyleSheet.create({
  listWrap: {
    padding: spacing.sm,
  },
  detailWrap: {
    padding: spacing.sm,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  cardBody: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  panel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  stepLabel: {
    marginLeft: spacing.sm,
  },
  infoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  gapSm: {
    marginTop: spacing.xs,
  },
  gapXs: {
    marginTop: spacing.xs,
  },
});
