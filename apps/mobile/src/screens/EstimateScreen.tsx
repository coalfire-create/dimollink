import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  type BuildingStructure,
  type VolumeEstimate,
} from '@dimol/shared';
import { ApiError, estimateVolume } from '../api/client';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader } from '../navigation';
import { theme } from '../theme';

const CONFIDENCE_LABELS: Record<string, string> = { LOW: '참고 수준', MEDIUM: '보통' };

/**
 * 폐기물 양 미리 계산 (Phase 6 물량 추정).
 * 서버가 내려주는 disclaimer(한계 고지)를 반드시 함께 노출한다.
 */

const STRUCTURES = Object.entries(BUILDING_STRUCTURE_LABELS) as Array<[BuildingStructure, string]>;

export function EstimateScreen() {
  const [area, setArea] = useState('');
  const [structure, setStructure] = useState<BuildingStructure | null>(null);
  const [result, setResult] = useState<VolumeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(
        await estimateVolume({
          floorAreaM2: Number(area),
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
        <Text style={styles.intro}>면적과 구조로 예상 폐기물 양을 계산해요.</Text>

        <Field
          label="건물 연면적 (㎡)"
          value={area}
          onChangeText={setArea}
          placeholder="예) 100"
          keyboardType="numeric"
          hint="30평 ≈ 99㎡"
        />

        <Text style={styles.structureLabel}>건물 구조 (선택)</Text>
        <View style={styles.structureRow}>
          {STRUCTURES.map(([value, label]) => {
            const selected = structure === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setStructure(selected ? null : value)}
                style={[styles.structureChip, selected && styles.structureChipSelected]}
              >
                <Text style={[styles.structureChipText, selected && { color: colors.background }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ErrorBanner message={error} />
        <AppButton label="계산하기" onPress={calculate} loading={loading} />

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
              <Text style={styles.resultDisclaimer}>{result.disclaimer}</Text>
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
  intro: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.md,
  },
  structureLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  structureRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  structureChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: 'center',
    marginRight: spacing.xs,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.md,
  },
  structureChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  structureChipText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginTop: spacing.md,
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
    marginVertical: spacing.xs,
  },
  resultDisclaimer: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
});
