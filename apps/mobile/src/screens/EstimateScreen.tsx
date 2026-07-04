import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  type BuildingStructure,
  type VolumeEstimate,
} from '@dimol/shared';
import { ApiError, estimateVolume } from '../api/client';
import { AppButton, Card, ErrorBanner, Field } from '../components/ui';
import { ScreenHeader } from '../navigation';
import { theme } from '../theme';

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
        <Text style={styles.intro}>
          건물 면적과 구조를 알려 주시면 폐기물이 대략 몇 톤 나올지 계산해 드려요.
        </Text>

        <Field
          label="건물 연면적 (㎡)"
          value={area}
          onChangeText={setArea}
          placeholder="예) 100"
          keyboardType="numeric"
          hint="1평은 약 3.3㎡ 예요. (30평 ≈ 99㎡)"
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
          <Card style={styles.resultCard}>
            <Text style={styles.resultLabel}>예상 폐기물 양</Text>
            <Text style={styles.resultTons}>약 {result.estimatedTons}톤</Text>
            <Text style={styles.resultDisclaimer}>{result.disclaimer}</Text>
          </Card>
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
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  intro: {
    color: colors.text,
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
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 2,
    justifyContent: 'center',
    marginRight: spacing.xs,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  structureChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  structureChipText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#E7EFFC',
    borderColor: colors.primary,
    marginTop: spacing.md,
  },
  resultLabel: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  resultTons: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: '800',
    marginVertical: spacing.xs,
  },
  resultDisclaimer: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
});
