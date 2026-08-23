import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_HINTS,
  BUILDING_STRUCTURE_LABELS,
  m2ToPyeong,
  pyeongToM2,
  type BuildingStructure,
  type VolumeEstimate,
} from '@dimol/shared';
import { ApiError, estimateVolume } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: '참고 수준',
  MEDIUM: '보통',
  HIGH: '높음',
};

/**
 * 폐기물 양 미리 계산 (Phase 6 물량 추정).
 * 서버가 내려주는 disclaimer(한계 고지)를 반드시 함께 노출한다.
 *
 * 입력은 한국 사용자 기준에 맞춰 평/㎡ 를 토글하고, 층수를 따로 받아
 * "한 층 바닥면적 × 층수 = 연면적"을 앱에서 계산해 보여준다(실제 계산은 서버가 확정).
 */

const STRUCTURES = Object.entries(BUILDING_STRUCTURE_LABELS) as Array<[BuildingStructure, string]>;

type AreaUnit = 'PYEONG' | 'M2';

export function EstimateScreen() {
  const nav = useNavigation();
  const [unit, setUnit] = useState<AreaUnit>('PYEONG');
  const [area, setArea] = useState('');
  const [floors, setFloors] = useState('1');
  const [structure, setStructure] = useState<BuildingStructure | null>(null);
  const [result, setResult] = useState<VolumeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const areaNum = Number(area);
  const floorsNum = Number(floors);
  const areaValid = Number.isFinite(areaNum) && areaNum > 0;
  const floorsValid = Number.isInteger(floorsNum) && floorsNum >= 1;
  const canCalculate = areaValid && floorsValid;

  /** 입력값 → 연면적(㎡) 실시간 미리보기. 서버 계산과 같은 규칙을 쓴다. */
  const totalAreaM2 = useMemo(() => {
    if (!canCalculate) return null;
    const perFloorM2 = unit === 'PYEONG' ? pyeongToM2(areaNum) : areaNum;
    return Math.round(perFloorM2 * floorsNum * 10) / 10;
  }, [canCalculate, unit, areaNum, floorsNum]);

  /** 입력이 바뀌면 이전 결과는 더 이상 유효하지 않다 — 오해 방지를 위해 지운다. */
  function resetResult() {
    setResult(null);
    setError(null);
  }

  async function calculate() {
    if (!canCalculate) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(
        await estimateVolume({
          floorAreaM2: unit === 'PYEONG' ? pyeongToM2(areaNum) : areaNum,
          floors: floorsNum,
          structure: structure ?? undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '계산에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="폐기물 양 미리 계산" canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FadeInUp delay={20}>
          <View style={styles.introCard}>
            <AppIcon name="sparkles" size={22} color={colors.primary} />
            <Text style={styles.introText}>
              면적과 구조만 입력하면 예상 폐기물 양과{'\n'}필요한 운반 차량 대수를 알려드려요.
            </Text>
          </View>
        </FadeInUp>

        {/* 1단계 — 면적 (평/㎡ 토글) */}
        <FadeInUp delay={60}>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.stepTitle}>건물 면적</Text>
          </View>

          <View style={styles.unitToggle}>
            {(
              [
                ['PYEONG', '평'],
                ['M2', '㎡'],
              ] as Array<[AreaUnit, string]>
            ).map(([value, label]) => {
              const active = unit === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`단위 ${label}`}
                  onPress={() => {
                    if (active) return;
                    // 입력한 숫자를 새 단위 기준으로 변환해 이어서 쓰게 한다.
                    if (areaValid) {
                      setArea(String(value === 'M2' ? pyeongToM2(areaNum) : m2ToPyeong(areaNum)));
                    }
                    setUnit(value);
                    resetResult();
                  }}
                  style={[styles.unitOption, active && styles.unitOptionActive]}
                >
                  <Text style={[styles.unitOptionText, active && styles.unitOptionTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label={unit === 'PYEONG' ? '한 층 바닥면적 (평)' : '한 층 바닥면적 (㎡)'}
            value={area}
            onChangeText={(t) => {
              setArea(t);
              resetResult();
            }}
            placeholder={unit === 'PYEONG' ? '예) 30' : '예) 99'}
            keyboardType="numeric"
            hint={
              unit === 'PYEONG'
                ? '평수를 모르면 ㎡ 로 바꿔서 입력하세요.'
                : '30평 ≈ 99㎡ · 1평 ≈ 3.3㎡'
            }
          />

          <Field
            label="층수"
            value={floors}
            onChangeText={(t) => {
              setFloors(t);
              resetResult();
            }}
            placeholder="예) 2"
            keyboardType="numeric"
            hint="지하층이 있으면 함께 세어 주세요."
          />

          {totalAreaM2 !== null ? (
            <View style={styles.totalAreaBox}>
              <Text style={styles.totalAreaLabel}>연면적 합계</Text>
              <Text style={styles.totalAreaValue}>
                {totalAreaM2.toLocaleString('ko-KR')}㎡
                <Text style={styles.totalAreaSub}>
                  {'  '}({m2ToPyeong(totalAreaM2).toLocaleString('ko-KR')}평)
                </Text>
              </Text>
            </View>
          ) : null}
        </FadeInUp>

        {/* 2단계 — 구조 */}
        <FadeInUp delay={100}>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={styles.stepTitle}>건물 구조</Text>
            <Text style={styles.stepOptional}>선택하면 더 정확해요</Text>
          </View>

          <View style={styles.structureList}>
            {STRUCTURES.map(([value, label]) => {
              const selected = structure === value;
              return (
                <PressableScale
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setStructure(selected ? null : value);
                    resetResult();
                  }}
                  style={[styles.structureCard, selected && styles.structureCardSelected]}
                >
                  <View style={styles.structureTextBox}>
                    <Text style={[styles.structureName, selected && { color: colors.primary }]}>
                      {label}
                    </Text>
                    <Text style={styles.structureHint}>{BUILDING_STRUCTURE_HINTS[value]}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <AppIcon name="check" size={14} color="#FFFFFF" /> : null}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </FadeInUp>

        <ErrorBanner message={error} />

        <AppButton
          label="계산하기"
          onPress={calculate}
          loading={loading}
          disabled={!canCalculate}
        />
        {!canCalculate && area.length > 0 ? (
          <Text style={styles.inputWarning}>
            {!areaValid ? '면적을 숫자로 입력해 주세요.' : '층수는 1 이상 정수로 입력해 주세요.'}
          </Text>
        ) : null}

        {result ? (
          <FadeInUp>
            <View style={styles.resultCard}>
              <View style={styles.resultTopRow}>
                <Text style={styles.resultLabel}>예상 폐기물 양</Text>
                <View style={styles.confidenceChip}>
                  <Text style={styles.confidenceText}>
                    신뢰도 {CONFIDENCE_LABELS[result.confidence] ?? result.confidence}
                  </Text>
                </View>
              </View>

              <Text style={styles.resultTons}>약 {result.estimatedTons}톤</Text>
              <Text style={styles.resultRange}>
                예상 범위 {result.rangeMinTons} ~ {result.rangeMaxTons}톤
              </Text>

              {/* 톤수만으로는 감이 안 오니 차량 대수로 환산해 준다. */}
              {result.truckLoads.length > 0 ? (
                <View style={styles.truckBox}>
                  <Text style={styles.truckBoxTitle}>운반 차량으로 환산하면</Text>
                  {result.truckLoads.map((t) => (
                    <View key={t.capacityTons} style={styles.truckRow}>
                      <AppIcon name="truck" size={20} color={colors.primary} />
                      <Text style={styles.truckText}>
                        {t.capacityTons}톤 트럭 약 <Text style={styles.truckCount}>{t.count}대</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* 계산 근거를 열어 보여줘야 숫자를 신뢰할 수 있다. */}
              <View style={styles.basisBox}>
                <Text style={styles.basisTitle}>계산 근거</Text>
                <Text style={styles.basisText}>
                  연면적 {result.floorAreaM2.toLocaleString('ko-KR')}㎡
                  {structure ? ` · ${BUILDING_STRUCTURE_LABELS[structure]}` : ' · 구조 미지정'}
                </Text>
              </View>

              <Text style={styles.resultDisclaimer}>{result.disclaimer}</Text>

              {/* 계산만 하고 끝나지 않게 — 바로 신청으로 이어준다. */}
              <View style={styles.ctaBox}>
                <AppButton
                  label="이 물량으로 철거 신청하기"
                  onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
                />
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryLink}
                  onPress={() => nav.push({ name: 'siteAnalysis' })}
                >
                  <Text style={styles.secondaryLinkText}>
                    사진으로 더 정확히 분석하기 ›
                  </Text>
                </Pressable>
              </View>
            </View>
          </FadeInUp>
        ) : null}
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing, touch, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  introCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  introText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '600',
    lineHeight: font.body + 8,
    marginLeft: spacing.sm,
  },
  stepRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    marginRight: spacing.xs,
    width: 26,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: font.caption,
    fontWeight: '800',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  stepOptional: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginLeft: spacing.xs,
  },
  unitToggle: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: 4,
  },
  unitOption: {
    alignItems: 'center',
    borderRadius: radius.button - 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight - 8,
  },
  unitOptionActive: {
    backgroundColor: colors.background,
    ...theme.shadow.card,
  },
  unitOptionText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  unitOptionTextActive: {
    color: colors.primary,
  },
  totalAreaBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalAreaLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  totalAreaValue: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  totalAreaSub: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  structureList: {
    marginBottom: spacing.lg,
  },
  structureCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    minHeight: touch.minButtonHeight + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  structureCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  structureTextBox: {
    flex: 1,
  },
  structureName: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  structureHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: 2,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 24,
  },
  radioSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  inputWarning: {
    color: colors.error,
    fontSize: font.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  resultTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultLabel: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  confidenceChip: {
    backgroundColor: colors.background,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  confidenceText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  resultTons: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  resultRange: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  truckBox: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  truckBoxTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  truckRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  truckText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  truckCount: {
    color: colors.primary,
    fontWeight: '800',
  },
  basisBox: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  basisTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: 2,
  },
  basisText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  resultDisclaimer: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
  },
  ctaBox: {
    marginTop: spacing.md,
  },
  secondaryLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: touch.minButtonHeight,
  },
  secondaryLinkText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
});
