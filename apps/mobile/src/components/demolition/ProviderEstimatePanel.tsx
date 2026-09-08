import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  exceedsPreliminary,
  validatePreliminaryRange,
  type DemolitionEstimate,
} from '@dimol/shared';
import {
  ApiError,
  listDemolitionEstimates,
  submitFinalEstimate,
  submitPreliminaryEstimate,
} from '../../api/client';
import { AppButton, Card, ErrorBanner, Field } from '../ui';
import { theme } from '../../theme';

/**
 * 업체용 철거 견적 패널 — 개산(범위) 제출 → 실사 일정 확인 → 확정 제출.
 *
 * 개산을 **범위로만** 받는 이유: 사진만 보고 단일 금액을 부르면 확신 없는 것을 확신
 * 있는 척하게 되고, 실사 후 올릴 때 소비자가 속았다고 느낀다. 범위로 받고, 상단을
 * 넘길 때 사유를 남기게 하는 편이 서로에게 낫다.
 */

function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

/** "1,200만" 같은 입력도 받도록 숫자만 남긴다. */
function parseAmount(input: string): number {
  return Number(input.replace(/[^0-9]/g, ''));
}

export function ProviderEstimatePanel({ requestId }: { requestId: string }) {
  const [mine, setMine] = useState<DemolitionEstimate | null>(null);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [overrunReason, setOverrunReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // 밀봉이라 서버가 내 것만 돌려준다.
      const rows = await listDemolitionEstimates(requestId);
      setMine(rows[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적을 불러오지 못했습니다.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function submitPreliminary() {
    const min = parseAmount(minAmount);
    const max = parseAmount(maxAmount);
    const valid = validatePreliminaryRange(min, max);
    if (!valid.ok) {
      setError(valid.error ?? '개산 범위를 확인해 주세요.');
      return;
    }
    void run(
      () =>
        submitPreliminaryEstimate({
          requestId,
          minAmount: min,
          maxAmount: max,
          memo: memo.trim() || undefined,
        }),
      '개산 견적 제출에 실패했습니다.',
    );
  }

  function submitFinal() {
    if (!mine) return;
    const amount = parseAmount(finalAmount);
    if (!(amount > 0)) {
      setError('확정 금액을 입력해 주세요.');
      return;
    }
    if (exceedsPreliminary(mine, amount) && overrunReason.trim().length === 0) {
      setError('개산 범위를 넘는 금액입니다. 초과 사유를 적어 주세요(소비자에게 그대로 보입니다).');
      return;
    }
    void run(
      () =>
        submitFinalEstimate({
          estimateId: mine.id,
          amount,
          overrunReason: overrunReason.trim() || undefined,
        }),
      '확정 견적 제출에 실패했습니다.',
    );
  }

  // ── 아직 개산을 안 냈다
  if (!mine) {
    return (
      <Card>
        <Text style={styles.title}>개산 견적 내기</Text>
        <Text style={styles.hint}>
          사진과 건축물대장만 보고 내는 <Text style={styles.strong}>예상 범위</Text>입니다.
          구속력이 없으니 무리해서 좁게 잡지 않아도 됩니다. 실사 후에 확정 금액을 냅니다.
        </Text>
        <ErrorBanner message={error} />
        <Field label="예상 하단(원)" value={minAmount} onChangeText={setMinAmount} keyboardType="number-pad" placeholder="8000000" />
        <Field label="예상 상단(원)" value={maxAmount} onChangeText={setMaxAmount} keyboardType="number-pad" placeholder="12000000" />
        <Field label="메모 (선택)" value={memo} onChangeText={setMemo} placeholder="예: 외부 사진 기준, 지하 여부 미확인" />
        <AppButton label="개산 견적 보내기" onPress={submitPreliminary} loading={busy} />
      </Card>
    );
  }

  const overrun = exceedsPreliminary(mine, parseAmount(finalAmount));

  return (
    <Card>
      <Text style={styles.title}>내 견적</Text>
      <Text style={styles.rangeLabel}>개산 (구속력 없음)</Text>
      <Text style={styles.range}>
        {won(mine.preliminary.minAmount)} ~ {won(mine.preliminary.maxAmount)}
      </Text>
      <ErrorBanner message={error} />

      {mine.final ? (
        <View>
          <Text style={styles.rangeLabel}>확정 견적</Text>
          <Text style={styles.final}>{won(mine.final.amount)}</Text>
          <Text style={styles.hint}>
            {mine.accepted ? '소비자가 수락했습니다. 매칭이 확정되었습니다.' : '소비자 응답을 기다리는 중입니다.'}
          </Text>
        </View>
      ) : mine.visit ? (
        <View>
          <Text style={styles.visit}>
            실사 예약 {new Date(mine.visit.scheduledAt).toLocaleString('ko-KR')}
          </Text>
          <Text style={styles.hint}>
            실사를 마쳤으면 확정 금액을 보내세요. 이 금액이 계약금액이 됩니다.
          </Text>
          <Field label="확정 금액(원)" value={finalAmount} onChangeText={setFinalAmount} keyboardType="number-pad" placeholder="11000000" />
          {overrun ? (
            <>
              <Text style={styles.warn}>
                개산 상단({won(mine.preliminary.maxAmount)})을 넘습니다. 사유가 소비자에게 그대로
                보이고, 업체 정확도 지표에도 반영됩니다.
              </Text>
              <Field
                label="초과 사유 (필수)"
                value={overrunReason}
                onChangeText={setOverrunReason}
                placeholder="예: 지하 정화조 발견, 폐기물 30톤 추가"
              />
            </>
          ) : null}
          <AppButton label="확정 견적 보내기" onPress={submitFinal} loading={busy} />
        </View>
      ) : (
        <Text style={styles.hint}>
          소비자가 실사를 요청하면 알림이 갑니다. 실사 후에 확정 금액을 낼 수 있습니다.
        </Text>
      )}
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5, marginTop: spacing.xs },
  strong: { color: colors.text, fontWeight: '800' },
  rangeLabel: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },
  range: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  final: { color: colors.primary, fontSize: font.title, fontWeight: '800' },
  visit: { color: colors.text, fontSize: font.body, fontWeight: '700', marginTop: spacing.sm },
  warn: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.sm },
});
