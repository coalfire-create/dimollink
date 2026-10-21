import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { AppButton, AmountDisplay, Card, StatusBadge } from '../../components/ui';
import { won } from '../../lib/format';
import { payableAmount, requesterNextStep } from '../../lib/request-next-step';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 요약 카드 — 종류·상태·금액, 그리고 배출자에게는 **지금 할 일** 한 줄.
 *
 * 결제할 차례면 카드를 강조하고 여기서 바로 결제한다. 결제는 이 화면에서 사용자가
 * 해야 할 유일한 일인데, 아래로 스크롤해야 찾을 수 있으면 "매칭됐다"는 것만 보고 나가 버린다.
 * 금액은 합의 금액 전액(선결제) — 계약금·잔금으로 나누지 않는다([[request-next-step]]).
 * 위치 보기·후기 같은 나머지 행동은 아래 [[CounterpartyActions]] 가 맡는다.
 */
export function RequestHeroCard({
  request,
  kindLabel,
  isRequester,
}: {
  request: ServiceRequest;
  kindLabel: string;
  isRequester: boolean;
}) {
  const nav = useNavigation();
  const step = isRequester ? requesterNextStep(request) : null;
  const payable = isRequester ? payableAmount(request) : null;
  return (
    <Card style={step?.needsAttention ? styles.cardHighlight : undefined}>
      <View style={styles.topRow}>
        <Text style={styles.kind}>{kindLabel}</Text>
        <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
      </View>
      {step ? (
        <>
          <Text style={styles.headline}>{step.headline}</Text>
          <Text style={styles.hint}>{step.hint}</Text>
        </>
      ) : (
        <Text style={styles.hint}>{request.region}</Text>
      )}
      {request.agreedFee !== undefined ? (
        <>
          <View style={styles.divider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>{payable !== null ? '결제할 금액' : '합의 금액'}</Text>
            <AmountDisplay
              value={request.agreedFee}
              size="lg"
              color={payable !== null ? 'primary' : 'text'}
            />
          </View>
        </>
      ) : null}
      {payable !== null ? (
        <AppButton
          label={`${won(payable)} 결제하기`}
          style={styles.button}
          onPress={() => nav.push({ name: 'payment', requestId: request.id })}
        />
      ) : null}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  cardHighlight: {
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
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.sm,
  },
  feeRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feeLabel: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  feeValue: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  button: {
    marginTop: spacing.sm,
  },
});
