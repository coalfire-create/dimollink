import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { StatusBadge } from '../../components/ui';
import { AppIcon } from '../../components/AppIcon';
import { REQUEST_TIMELINE } from '../../components/StatusTimeline';
import { TABULAR_NUMS } from '../../lib/format';
import { requestSubtitle, requestTons } from '../../lib/request-summary';
import { payableAmount } from '../../lib/request-next-step';
import { statusColor, theme } from '../../theme';

/**
 * 대시보드 행 — 반복 아이콘 타일을 걷어내고 왼쪽 3px 상태 컬러 레일과
 * 단정한 타이포그래피 위계(종류 · 현장 제목 · 날짜/물량 · 얇은 진행선)로 구성한다.
 */
export function RequestRow({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  const tons = requestTons(request);
  const stepIndex = REQUEST_TIMELINE.indexOf(request.status);
  const cancelled = request.status === 'CANCELLED';
  const progress = cancelled || stepIndex < 0 ? 0 : (stepIndex + 1) / REQUEST_TIMELINE.length;
  const due = payableAmount(request) !== null;
  const accent = statusColor(due ? 'PAYMENT_DUE' : request.status).text;

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
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.card,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.statusRail, { backgroundColor: accent }]} />
      <View style={styles.inner}>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{REQUEST_KIND_LABELS[request.kind]}</Text>
            <View style={styles.topRowRight}>
              {due ? (
                <StatusBadge status="PAYMENT_DUE" label="결제 대기" />
              ) : (
                <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
              )}
              <AppIcon name="chevronRight" size={20} color={colors.textMuted} />
            </View>
          </View>
          <Text style={styles.headline} numberOfLines={1}>
            {requestSubtitle(request)}
          </Text>
          <Text style={[styles.meta, TABULAR_NUMS]} numberOfLines={1}>
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
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    overflow: 'hidden',
    ...theme.shadow.card,
  },
  cardHovered: {
    borderColor: colors.borderStrong,
  },
  cardPressed: {
    opacity: 0.92,
  },
  statusRail: {
    width: 3,
  },
  inner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    padding: spacing.md,
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
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  headline: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginTop: 4,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 4,
  },
  progressTrack: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: '100%',
  },
});
