import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { exceedsPreliminary, type DemolitionEstimate, type FloorAreaBasis } from '@dimol/shared';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../ui';
import { won, amountReadout } from '../../lib/format';
import { theme } from '../../theme';
import { UnitConversion } from './UnitConversion';
import { parseAmount } from './parseAmount';

/**
 * 2~3단계 — 낸 개산을 보여주고, 실사가 잡혔으면 확정 금액을 받는다.
 *
 * 확정 금액이 개산 상단을 넘으면 **사유를 반드시 받는다.** 그 사유는 소비자에게 그대로
 * 보이고 업체 정확도 지표에도 남는다 — 추가금을 못 올리게 막는 게 아니라, 왜 올랐는지가
 * 기록으로 남아야 실사 후 분쟁이 말싸움으로 가지 않는다.
 */
export function MyEstimateCard({
  mine,
  area,
  wasteTons,
  busy,
  error,
  onSubmitFinal,
}: {
  mine: DemolitionEstimate;
  area: FloorAreaBasis | null;
  wasteTons: number;
  busy: boolean;
  error: string | null;
  onSubmitFinal: (input: { amount: number; overrunReason?: string }) => void;
}) {
  const [finalAmount, setFinalAmount] = useState('');
  const [overrunReason, setOverrunReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const shown = error ?? localError;
  const overrun = exceedsPreliminary(mine, parseAmount(finalAmount));

  function submit() {
    setLocalError(null);
    const amount = parseAmount(finalAmount);
    if (!(amount > 0)) {
      setLocalError('확정 금액을 입력해 주세요.');
      return;
    }
    if (exceedsPreliminary(mine, amount) && overrunReason.trim().length === 0) {
      setLocalError(
        '개산 범위를 넘는 금액입니다. 초과 사유를 적어 주세요(소비자에게 그대로 보입니다).',
      );
      return;
    }
    onSubmitFinal({ amount, overrunReason: overrunReason.trim() || undefined });
  }

  return (
    <View>
      <SectionTitle>내 견적</SectionTitle>
      <Card>
        <Text style={styles.stageLabel}>개산 (구속력 없음)</Text>
        <Text style={styles.range}>
          {won(mine.preliminary.minAmount)} ~ {won(mine.preliminary.maxAmount)}
        </Text>
        <UnitConversion amount={mine.preliminary.maxAmount} area={area} wasteTons={wasteTons} />
        {mine.preliminary.memo ? (
          <Text style={styles.memo}>메모 · {mine.preliminary.memo}</Text>
        ) : null}

        <ErrorBanner message={shown} />

        {mine.final ? (
          <View style={styles.stageBox}>
            <Text style={styles.stageLabel}>확정 견적</Text>
            <Text style={styles.final}>{won(mine.final.amount)}</Text>
            <UnitConversion amount={mine.final.amount} area={area} wasteTons={wasteTons} />
            <Text style={styles.hint}>
              {mine.accepted
                ? '소비자가 수락했습니다. 매칭이 확정되었습니다.'
                : '소비자 응답을 기다리는 중입니다.'}
            </Text>
          </View>
        ) : mine.visit ? (
          <View style={styles.stageBox}>
            <Text style={styles.visit}>
              실사 예약 {new Date(mine.visit.scheduledAt).toLocaleString('ko-KR')}
            </Text>
            <Text style={styles.hint}>
              실사를 마쳤으면 확정 금액을 보내세요.{' '}
              <Text style={styles.strong}>이 금액이 계약금액이 됩니다.</Text>
            </Text>
            <Field
              label="확정 금액(원)"
              required
              value={finalAmount}
              // 숫자만 치면 0 하나 차이를 놓친다 — 아래에 말로 읽어 준다.
              hint={amountReadout(finalAmount)}
              onChangeText={setFinalAmount}
              keyboardType="number-pad"
              placeholder="11000000"
            />
            <UnitConversion amount={parseAmount(finalAmount)} area={area} wasteTons={wasteTons} />

            {overrun ? (
              <>
                <Text style={styles.warn}>
                  개산 상단({won(mine.preliminary.maxAmount)})을 넘습니다. 사유가 소비자에게 그대로
                  보이고, 업체 정확도 지표에도 반영됩니다.
                </Text>
                <Field
                  label="초과 사유"
                  required
                  value={overrunReason}
                  onChangeText={setOverrunReason}
                  placeholder="예: 지하 정화조 발견, 폐기물 30톤 추가"
                />
              </>
            ) : null}

            <AppButton label="확정 견적 보내기" onPress={submit} loading={busy} disabled={busy} />
          </View>
        ) : (
          <Text style={styles.hint}>
            소비자가 실사를 요청하면 알림이 갑니다. 실사 후에 확정 금액을 낼 수 있습니다.
          </Text>
        )}
      </Card>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  hint: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  strong: {
    color: colors.text,
    fontWeight: '800',
  },
  stageLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  range: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  memo: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
  },
  stageBox: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  final: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  visit: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  warn: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: spacing.xs,
  },
});
