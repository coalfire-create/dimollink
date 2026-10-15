import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CANCELLATION_PENALTY_RATE, type ServiceRequest } from '@dimol/shared';
import { AppButton, Card, InfoRow, SectionTitle } from '../../components/ui';
import { won } from '../../lib/format';
import { payableAmount } from '../../lib/request-next-step';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 결제 탭 — 이 요청에서 **실제로 오간 돈**만 보여준다.
 *
 * 서버가 가진 값(합의 금액·결제 번호·상태)만 쓴다. 화면에서 금액을 쪼개거나
 * (계약금/잔금) 받지 않은 결제를 "예치완료"로 적으면 고객센터로 오는 첫 질문이 된다.
 * 결제 번호는 문의할 때 건을 찾는 열쇠라 그대로 보여준다.
 */
function paymentStateLabel(request: ServiceRequest): string {
  if (payableAmount(request) !== null) return '결제 전';
  if (request.status === 'CANCELLED')
    return request.paymentId ? '취소 · 환불 처리' : '결제 없이 취소';
  if (request.paymentId) return '결제 완료';
  return '결제 금액 확정 전';
}

export function PaymentSummaryCard({
  request,
  isRequester,
}: {
  request: ServiceRequest;
  isRequester: boolean;
}) {
  const nav = useNavigation();
  const payable = isRequester ? payableAmount(request) : null;
  const penaltyPct = Math.round(CANCELLATION_PENALTY_RATE * 100);
  return (
    <View>
      <SectionTitle>결제 정보</SectionTitle>
      <Card>
        <Text style={styles.amountLabel}>
          {request.agreedFee !== undefined ? '결제 금액' : '결제 금액이 아직 정해지지 않았어요'}
        </Text>
        {request.agreedFee !== undefined ? (
          <Text style={styles.amount}>{won(request.agreedFee)}</Text>
        ) : null}
        <View style={styles.rows}>
          <InfoRow label="결제 상태" value={paymentStateLabel(request)} />
          <InfoRow label="결제 방식" value="선결제 (매칭 확정 시 전액)" />
          {request.paymentId ? <InfoRow label="결제 번호" value={request.paymentId} /> : null}
        </View>
        {payable !== null ? (
          <AppButton
            label={`${won(payable)} 결제하기`}
            style={styles.button}
            onPress={() => nav.push({ name: 'payment', requestId: request.id })}
          />
        ) : null}
      </Card>

      <SectionTitle>취소 · 환불 기준</SectionTitle>
      <Card>
        <InfoRow label="배차 전" value="전액 환불" />
        <InfoRow label="배차 후 ~ 작업 전" value={`위약금 ${penaltyPct}% 제외 환불`} />
        <InfoRow label="작업 시작 후" value="취소할 수 없어요" />
      </Card>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  amountLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  amount: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  rows: {
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.md,
  },
});
