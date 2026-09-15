import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { AppButton, Card, StatusBadge } from '../../components/ui';
import { won } from '../../lib/format';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 요약 카드 — 종류·지역·상태·합의 금액을 한눈에.
 *
 * 결제할 차례(MATCHED + 합의 금액 있음)면 카드를 강조하고 여기서 바로 결제한다.
 * 결제는 이 화면에서 사용자가 해야 할 유일한 일인데, 아래로 스크롤해야 찾을 수 있으면
 * "매칭됐다"는 것만 보고 나가 버린다.
 */
export function RequestHeroCard({
  request,
  kindLabel,
  awaitingPayment,
}: {
  request: ServiceRequest;
  kindLabel: string;
  awaitingPayment: boolean;
}) {
  const nav = useNavigation();

  return (
    <Card style={awaitingPayment ? styles.cardHighlight : styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.kind}>{kindLabel}</Text>
        <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
      </View>
      <Text style={styles.region}>{request.region}</Text>

      {request.agreedFee !== undefined ? (
        <>
          <View style={styles.divider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>
              {request.status === 'MATCHED' ? '결제 예정 금액' : '합의 금액'}
            </Text>
            <Text style={styles.feeValue}>{won(request.agreedFee)}</Text>
          </View>
        </>
      ) : null}

      {awaitingPayment ? (
        <>
          <Text style={styles.actionHint}>결제하면 바로 작업이 시작돼요.</Text>
          <AppButton
            label="결제하기"
            style={styles.button}
            onPress={() => nav.push({ name: 'payment', requestId: request.id })}
          />
        </>
      ) : null}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
  },
  cardHighlight: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kind: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  region: {
    color: colors.textMuted,
    fontSize: font.body,
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
  actionHint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.xs,
  },
});
