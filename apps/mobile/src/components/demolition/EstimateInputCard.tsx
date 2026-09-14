import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  exceedsPreliminary,
  perSquareMeter,
  perTon,
  suggestedRange,
  validatePreliminaryRange,
  type DemolitionEstimate,
  type FloorAreaBasis,
} from '@dimol/shared';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../ui';
import { PressableScale } from '../motion';
import { theme } from '../../theme';

/**
 * 견적 입력 — 개산(범위) 제출 → 실사 대기 → 확정 제출.
 *
 * 예전 패널과 다른 점은 **입력하는 동안 근거를 같이 보여준다**는 것이다.
 * 금액만 덩그러니 치면 "이게 싼 건지 비싼 건지"를 업체가 머릿속으로 계산해야 했다.
 * 지금은 치는 즉시 ㎡당·톤당 단가로 환산해 보여주고, 내 저장 단가가 있으면
 * 출발점이 될 범위를 제안한다(제안일 뿐, 자동으로 넣지 않는다).
 *
 * 개산을 범위로만 받는 이유는 그대로다 — 사진만 보고 단일 금액을 부르면 확신 없는 것을
 * 확신 있는 척하게 되고, 실사 후 올릴 때 소비자가 속았다고 느낀다.
 */

function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

/** "1,200만" 같은 입력도 받도록 숫자만 남긴다. */
function parseAmount(input: string): number {
  return Number(input.replace(/[^0-9]/g, ''));
}

/** 금액 입력 밑에 붙는 환산 줄. 근거가 없으면 아무것도 안 그린다. */
function UnitConversion({
  amount,
  area,
  wasteTons,
}: {
  amount: number;
  area: FloorAreaBasis | null;
  wasteTons: number;
}) {
  const perM2 = perSquareMeter(amount, area);
  const perTonAmount = perTon(amount, wasteTons);
  if (perM2 === null && perTonAmount === null) return null;

  return (
    <View style={styles.conversionRow}>
      {perM2 !== null ? (
        <Text style={styles.conversion}>㎡당 {won(perM2)}</Text>
      ) : null}
      {perTonAmount !== null ? (
        <Text style={styles.conversion}>톤당 {won(perTonAmount)}</Text>
      ) : null}
    </View>
  );
}

export function EstimateInputCard({
  mine,
  area,
  wasteTons,
  myUnitPrice,
  busy,
  error,
  onSubmitPreliminary,
  onSubmitFinal,
}: {
  mine: DemolitionEstimate | null;
  area: FloorAreaBasis | null;
  wasteTons: number;
  /** 마이페이지에 저장해 둔 내 단가(원/㎡). 없으면 제안을 띄우지 않는다. */
  myUnitPrice: number | null;
  busy: boolean;
  error: string | null;
  onSubmitPreliminary: (input: { minAmount: number; maxAmount: number; memo?: string }) => void;
  onSubmitFinal: (input: { amount: number; overrunReason?: string }) => void;
}) {
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [overrunReason, setOverrunReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const suggestion = suggestedRange(myUnitPrice, area);
  const shown = error ?? localError;

  function submitPreliminary() {
    setLocalError(null);
    const min = parseAmount(minAmount);
    const max = parseAmount(maxAmount);
    const valid = validatePreliminaryRange(min, max);
    if (!valid.ok) {
      setLocalError(valid.error ?? '개산 범위를 확인해 주세요.');
      return;
    }
    onSubmitPreliminary({ minAmount: min, maxAmount: max, memo: memo.trim() || undefined });
  }

  function submitFinal() {
    if (!mine) return;
    setLocalError(null);
    const amount = parseAmount(finalAmount);
    if (!(amount > 0)) {
      setLocalError('확정 금액을 입력해 주세요.');
      return;
    }
    if (exceedsPreliminary(mine, amount) && overrunReason.trim().length === 0) {
      setLocalError('개산 범위를 넘는 금액입니다. 초과 사유를 적어 주세요(소비자에게 그대로 보입니다).');
      return;
    }
    onSubmitFinal({ amount, overrunReason: overrunReason.trim() || undefined });
  }

  // ── 1단계: 아직 개산을 안 냈다
  if (!mine) {
    return (
      <View>
        <SectionTitle>개산 견적 내기</SectionTitle>
        <Card>
          <Text style={styles.hint}>
            사진과 건축물대장만 보고 내는 <Text style={styles.strong}>예상 범위</Text>입니다.
            구속력이 없으니 무리해서 좁게 잡지 않아도 됩니다. 실사 후에 확정 금액을 냅니다.
          </Text>

          {suggestion ? (
            <PressableScale
              accessibilityLabel={`제안 범위 ${won(suggestion.minAmount)}에서 ${won(suggestion.maxAmount)} 채우기`}
              onPress={() => {
                setMinAmount(String(suggestion.minAmount));
                setMaxAmount(String(suggestion.maxAmount));
              }}
              style={styles.suggestion}
            >
              <Text style={styles.suggestionLabel}>내 단가 기준 출발점</Text>
              <Text style={styles.suggestionRange}>
                {won(suggestion.minAmount)} ~ {won(suggestion.maxAmount)}
              </Text>
              <Text style={styles.suggestionNote}>
                {won(suggestion.unitPrice)}/㎡ × {suggestion.floorAreaM2.toLocaleString('ko-KR')}㎡
                · 눌러서 채우기
              </Text>
              <Text style={styles.suggestionWarn}>
                단가에는 현장 조건(진입·석면·지하)이 안 들어 있습니다. 그대로 내지 말고 조정하세요.
              </Text>
            </PressableScale>
          ) : (
            <Text style={styles.noSuggestion}>
              {area
                ? '마이페이지에 기준 단가(원/㎡)를 저장하면 출발점이 될 범위를 제안해 드려요.'
                : '연면적 근거가 없어 자동 제안을 띄우지 않습니다. 직접 산정하세요.'}
            </Text>
          )}

          <ErrorBanner message={shown} />

          <Field
            label="예상 하단(원)"
            required
            value={minAmount}
            onChangeText={setMinAmount}
            keyboardType="number-pad"
            placeholder="8000000"
          />
          <UnitConversion amount={parseAmount(minAmount)} area={area} wasteTons={wasteTons} />

          <Field
            label="예상 상단(원)"
            required
            value={maxAmount}
            onChangeText={setMaxAmount}
            keyboardType="number-pad"
            placeholder="12000000"
          />
          <UnitConversion amount={parseAmount(maxAmount)} area={area} wasteTons={wasteTons} />

          <Field
            label="메모 (선택)"
            value={memo}
            onChangeText={setMemo}
            placeholder="예: 외부 사진 기준, 지하 여부 미확인"
            hint="소비자에게 그대로 보입니다. 무엇을 못 봤는지 적어 두면 실사 후 설명이 쉬워집니다."
          />

          <AppButton
            label="개산 견적 보내기"
            onPress={submitPreliminary}
            loading={busy}
            disabled={busy}
          />
        </Card>
      </View>
    );
  }

  const overrun = exceedsPreliminary(mine, parseAmount(finalAmount));

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
              실사를 마쳤으면 확정 금액을 보내세요. <Text style={styles.strong}>이 금액이 계약금액이 됩니다.</Text>
            </Text>
            <Field
              label="확정 금액(원)"
              required
              value={finalAmount}
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

            <AppButton
              label="확정 견적 보내기"
              onPress={submitFinal}
              loading={busy}
              disabled={busy}
            />
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

const { colors, font, spacing, radius } = theme;

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
  suggestion: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  suggestionLabel: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  suggestionRange: {
    color: colors.primary,
    fontSize: font.title,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  suggestionNote: {
    color: colors.primary,
    fontSize: font.caption,
  },
  suggestionWarn: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  noSuggestion: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  conversionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: -spacing.sm,
  },
  conversion: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
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
