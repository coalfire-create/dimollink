import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { StatusBadge } from '../../components/ui';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { REQUEST_TIMELINE } from '../../components/StatusTimeline';
import { requestSubtitle, requestTons } from '../../lib/request-summary';
import { theme } from '../../theme';

/**
 * 대시보드 행 — 목록에서 한 건을 요약한다.
 *
 * 열을 늘리는 대신 **사용자가 목록에서 실제로 판단하는 것**만 남겼다: 무슨 요청인지 ·
 * 지금 어느 단계인지 · 얼마나 진행됐는지 · 언제 접수했는지.
 *
 * 진행률 막대를 두는 이유는 상태 이름(예: "결제완료")만으로는 전체 중 어디쯤인지
 * 안 보이기 때문이다. 취소된 건은 진행이 멈춘 것이라 막대를 그리지 않는다.
 */

/**
 * 요청 종류 → 아이콘.
 *
 * 이모지를 쓰지 않는다 — 같은 이모지도 안드로이드·iOS·폰트 버전마다 모양과 크기가
 * 달라 목록이 기기별로 다르게 보인다. 앱 전체가 쓰는 아이콘 세트로 맞춘다.
 */
const KIND_ICON: Record<string, IconName> = {
  DEMOLITION: 'hammer',
  TRANSPORT: 'truck',
  INTERIOR: 'tools',
  DISPOSAL_RESERVATION: 'recycle',
};

export function RequestRow({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const tons = requestTons(request);
  const stepIndex = REQUEST_TIMELINE.indexOf(request.status);
  const cancelled = request.status === 'CANCELLED';
  const progress = cancelled || stepIndex < 0 ? 0 : (stepIndex + 1) / REQUEST_TIMELINE.length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        REQUEST_KIND_LABELS[request.kind],
        REQUEST_STATUS_LABELS[request.status],
        requestSubtitle(request),
        tons,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.accentBar} />
      <View style={styles.inner}>
        <View style={styles.kindBadge}>
          <AppIcon name={KIND_ICON[request.kind] ?? 'document'} size={24} color={colors.primary} />
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{REQUEST_KIND_LABELS[request.kind]}</Text>
            <View style={styles.topRowRight}>
              <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
              <Text style={styles.chevron}>›</Text>
            </View>
          </View>
          <Text style={styles.headline} numberOfLines={1}>
            {requestSubtitle(request)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {new Date(request.createdAt).toLocaleDateString('ko-KR')} 접수
            {tons ? ` · ${tons}` : ''}
          </Text>
          {!cancelled ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    elevation: 3,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  accentBar: {
    backgroundColor: colors.primary,
    width: 3,
  },
  inner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    padding: spacing.sm,
  },
  kindBadge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
  },
  body: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topRowRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: font.title,
  },
  headline: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  progressTrack: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 6,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: '100%',
  },
});
