import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  suggestedRange,
  validatePreliminaryRange,
  type BuildingStructure,
  type FloorAreaBasis,
} from '@dimol/shared';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../ui';
import { PressableScale } from '../motion';
import { won, amountReadout } from '../../lib/format';
import { theme } from '../../theme';
import { PublicPriceReferenceNote } from './PublicPriceReferenceNote';
import { UnitConversion } from './UnitConversion';
import { parseAmount } from './parseAmount';

/**
 * 1단계 — 개산 견적(범위).
 *
 * **구속력이 없다**는 걸 화면이 먼저 말한다. 사진과 대장만 보고 내는 값이라, 좁게 잡으라고
 * 압박하면 업체는 안전하게 높은 쪽으로 부르거나 아예 안 낸다. 확정은 실사 뒤에 받는다.
 *
 * 저장해 둔 단가가 있으면 출발점을 제안하되, **단가에 없는 것**(진입·석면·지하)을
 * 바로 아래에 적어 둔다 — 제안을 그대로 내면 실사에서 뒤집힌다.
 */
export function PreliminaryEstimateForm({
  area,
  structure,
  wasteTons,
  myUnitPrice,
  busy,
  error,
  onSubmit,
}: {
  area: FloorAreaBasis | null;
  structure: BuildingStructure | undefined;
  wasteTons: number;
  /** 마이페이지에 저장해 둔 내 단가(원/㎡). 없으면 제안을 띄우지 않는다. */
  myUnitPrice: number | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: { minAmount: number; maxAmount: number; memo?: string }) => void;
}) {
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const suggestion = suggestedRange(myUnitPrice, area);
  const shown = error ?? localError;

  function submit() {
    setLocalError(null);
    const min = parseAmount(minAmount);
    const max = parseAmount(maxAmount);
    const valid = validatePreliminaryRange(min, max);
    if (!valid.ok) {
      setLocalError(valid.error ?? '개산 범위를 확인해 주세요.');
      return;
    }
    onSubmit({ minAmount: min, maxAmount: max, memo: memo.trim() || undefined });
  }

  return (
    <View>
      <SectionTitle>개산 견적 내기</SectionTitle>
      <Card>
        <Text style={styles.hint}>
          사진과 건축물대장만 보고 내는 <Text style={styles.strong}>예상 범위</Text>입니다. 구속력이
          없으니 무리해서 좁게 잡지 않아도 됩니다. 실사 후에 확정 금액을 냅니다.
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
              {won(suggestion.unitPrice)}/㎡ × {suggestion.floorAreaM2.toLocaleString('ko-KR')}㎡ ·
              눌러서 채우기
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

        <PublicPriceReferenceNote structure={structure} area={area} />

        <ErrorBanner message={shown} />

        <Field
          label="예상 하단(원)"
          required
          value={minAmount}
          // 숫자만 치면 0 하나 차이를 놓친다 — 아래에 말로 읽어 준다.
          hint={amountReadout(minAmount)}
          onChangeText={setMinAmount}
          keyboardType="number-pad"
          placeholder="8000000"
        />
        <UnitConversion amount={parseAmount(minAmount)} area={area} wasteTons={wasteTons} />

        <Field
          label="예상 상단(원)"
          required
          value={maxAmount}
          // 숫자만 치면 0 하나 차이를 놓친다 — 아래에 말로 읽어 준다.
          hint={amountReadout(maxAmount)}
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

        <AppButton label="개산 견적 보내기" onPress={submit} loading={busy} disabled={busy} />
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
});
