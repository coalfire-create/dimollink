import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { REQUEST_TIMELINE } from '../../components/StatusTimeline';
import { AppButton, Card, StatusBadge } from '../../components/ui';
import { won } from '../../lib/format';
import { requesterNextStep, type NextStepAction } from '../../lib/request-next-step';
import { requestSubtitle } from '../../lib/request-summary';
import { useNavigation, type Route } from '../../navigation';
import { theme } from '../../theme';

/**
 * 홈의 "지금 할 일" 카드 — 진행 중인 요청 한 건과 **바로 누를 다음 행동** 하나.
 *
 * 예전 대시보드는 상태 타임라인을 가로로 넘겨 보는 캐러셀이었다. 넘기는 동작을
 * 모르는 사용자는 두 번째 건을 못 보고, 상태를 봐도 결제하러 상세까지 들어가야 했다.
 * 세로로 쌓고, 카드마다 행동 버튼을 단다(결제할 차례면 강조).
 */
function routeFor(action: NextStepAction, request: ServiceRequest): Route {
  switch (action) {
    case 'PAY':
      return { name: 'payment', requestId: request.id };
    case 'TRACK':
      return { name: 'tracking', requestId: request.id };
    case 'REVIEW':
      return { name: 'reviewForm', requestId: request.id };
    case 'VIEW_ESTIMATES':
    case 'DETAIL':
      return { name: 'requestDetail', requestId: request.id };
  }
}

export function NextStepCard({ request }: { request: ServiceRequest }) {
  const nav = useNavigation();
  const step = requesterNextStep(request);
  const stepIndex = REQUEST_TIMELINE.indexOf(request.status);
  const progress = stepIndex < 0 ? 0 : (stepIndex + 1) / REQUEST_TIMELINE.length;
  const actionLabel =
    step.action === 'PAY' && request.agreedFee !== undefined
      ? `${won(request.agreedFee)} ${step.actionLabel}`
      : step.actionLabel;

  return (
    <Card
      style={step.needsAttention ? styles.attention : undefined}
      onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
    >
      <View style={styles.topRow}>
        <Text style={styles.kind}>{REQUEST_KIND_LABELS[request.kind]}</Text>
        <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
      </View>
      <Text style={styles.subtitle} numberOfLines={1}>
        {requestSubtitle(request)}
      </Text>
      <Text style={styles.headline}>{step.headline}</Text>
      <Text style={styles.hint}>{step.hint}</Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`전체 ${REQUEST_TIMELINE.length}단계 중 ${stepIndex + 1}단계`}
      >
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <AppButton
        label={actionLabel}
        variant={step.needsAttention ? 'primary' : 'outline'}
        style={styles.button}
        onPress={() => nav.push(routeFor(step.action, request))}
      />
    </Card>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  attention: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kind: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  headline: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  track: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 8,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: 8,
  },
  button: {
    marginTop: spacing.sm,
  },
});
