import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Card } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 결제 완료 카드 — 결제됐다는 사실과, 아직 되돌릴 수 있다는 사실.
 *
 * 환불 버튼은 배차 전(PAID)까지만 보인다. 작업이 시작된 뒤에는 취소 자체가 불가라
 * (CLAUDE.md 취소 정책) 버튼을 남겨 두면 눌렀다가 거절당하는 경험이 된다.
 */
export function PaidRefundCard({
  canRefund,
  refunding,
  onRefund,
}: {
  /** 결제 식별자가 있어야 환불을 걸 수 있다. */
  canRefund: boolean;
  refunding: boolean;
  onRefund: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <Text style={styles.paidBadge}>✓ 결제가 완료됐어요</Text>
      {canRefund ? (
        confirming ? (
          <View style={styles.confirmBlock}>
            <Text style={styles.policy}>
              아직 배차 전이라 전액 환불돼요. 정말 취소·환불하시겠어요?
            </Text>
            <AppButton
              label="취소하고 환불받기"
              variant="danger"
              onPress={onRefund}
              loading={refunding}
            />
            <View style={styles.gap} />
            <AppButton label="돌아가기" variant="outline" onPress={() => setConfirming(false)} />
          </View>
        ) : (
          <AppButton
            label="결제 취소·환불"
            variant="danger"
            style={styles.refundButton}
            onPress={() => setConfirming(true)}
          />
        )
      ) : null}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  confirmBlock: {
    marginTop: theme.spacing.sm,
  },
  refundButton: {
    marginTop: theme.spacing.sm,
  },
  gap: {
    height: theme.spacing.xs,
  },
  paidBadge: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  policy: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
  },
});
