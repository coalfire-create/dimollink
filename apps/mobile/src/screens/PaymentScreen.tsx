import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PLATFORM_FEE_RATE, REQUEST_KIND_LABELS, type ServiceRequest } from '@dimol/shared';
import { ApiError, getRequest, prepay } from '../api/client';
import { AppButton, Card, ErrorBanner, InfoRow, LoadingView } from '../components/ui';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

/**
 * 선결제 화면 — 매칭 확정(금액 합의)된 요청의 총액을 선결제한다.
 * 금액은 서버 확정 금액(request.agreedFee)이며 여기서 임의로 바꿀 수 없다.
 * 결제수단은 계좌이체(가상계좌) 기본 + 카드 병행(B2B 고액은 계좌이체 우선 유도).
 */
type PayMethod = 'VBANK' | 'CARD';

function todayKST(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('VBANK');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getRequest(requestId)
      .then(setRequest)
      .catch((err) => setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.'));
  }, [requestId]);

  async function pay() {
    setError(null);
    setPaying(true);
    try {
      await prepay({ matchRequestId: requestId, completedDate: todayKST(), payMethod });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '결제 처리에 실패했습니다.');
    } finally {
      setPaying(false);
    }
  }

  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="결제" canGoBack />
        <ErrorBanner message={error} />
        {error ? null : <LoadingView />}
      </View>
    );
  }

  const amount = request.agreedFee ?? 0;
  const fee = Math.round(amount * PLATFORM_FEE_RATE);

  if (done) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="결제 완료" canGoBack />
        <View style={styles.doneBox}>
          <Text style={styles.doneTitle}>✓ 결제가 완료됐어요</Text>
          <Text style={styles.doneDesc}>
            {payMethod === 'VBANK'
              ? '가상계좌로 입금 안내가 발송됐어요. 입금이 확인되면 작업이 시작돼요.'
              : '카드 결제가 완료됐어요. 곧 작업이 시작돼요.'}
          </Text>
          <AppButton label="확인" onPress={() => nav.pop()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="결제" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.amountLabel}>{REQUEST_KIND_LABELS[request.kind]} 결제 금액</Text>
          <Text style={styles.amount}>{amount.toLocaleString('ko-KR')}원</Text>
        </Card>

        <Card>
          <InfoRow label="예상 무게" value={`${request.wasteTons}톤`} />
          <InfoRow label="플랫폼 수수료 안내" value={`${Math.round(PLATFORM_FEE_RATE * 100)}% (${fee.toLocaleString('ko-KR')}원)`} />
          <Text style={styles.feeNote}>수수료는 업체 정산 시 차감돼요. 결제 금액은 위 총액이에요.</Text>
        </Card>

        <Text style={styles.methodTitle}>결제수단</Text>
        {(['VBANK', 'CARD'] as PayMethod[]).map((m) => {
          const selected = payMethod === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPayMethod(m)}
              style={[styles.methodCard, selected && styles.methodSelected]}
            >
              <Text style={[styles.methodLabel, selected && { color: theme.colors.primary }]}>
                {selected ? '✓ ' : ''}
                {m === 'VBANK' ? '계좌이체 (가상계좌)' : '카드 결제'}
              </Text>
              {m === 'VBANK' ? (
                <Text style={styles.methodHint}>고액 거래는 수수료 부담이 적은 계좌이체를 권장해요.</Text>
              ) : null}
            </Pressable>
          );
        })}

        <ErrorBanner message={error} />
        <AppButton
          label={`${amount.toLocaleString('ko-KR')}원 결제하기`}
          onPress={pay}
          loading={paying}
          disabled={amount <= 0}
        />
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.sm, paddingBottom: spacing.lg },
  amountLabel: { color: colors.textMuted, fontSize: font.body },
  amount: { color: colors.text, fontSize: font.titleLarge, fontWeight: '800', marginTop: spacing.xs / 2 },
  feeNote: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.xs },
  methodTitle: { color: colors.text, fontSize: font.title, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.sm },
  methodCard: {
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 2,
    marginBottom: spacing.xs,
    padding: spacing.sm,
  },
  methodSelected: { backgroundColor: '#E7F3EC', borderColor: colors.primary },
  methodLabel: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  methodHint: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.xs / 2 },
  doneBox: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg },
  doneTitle: { color: colors.primary, fontSize: font.titleLarge, fontWeight: '800' },
  doneDesc: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.lg, marginTop: spacing.sm, textAlign: 'center' },
});
