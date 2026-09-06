import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { INTERIOR_CATEGORY_LABELS, type InteriorCategory } from '@dimol/shared';
import { ApiError, createInteriorRequest } from '../api/client';
import { AddressPickerField } from '../components/AddressPickerField';
import { AppButton, ErrorBanner, Field, StickyFooter } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

/**
 * 인테리어 시공 요청 작성 (소비자) — 파일럿 밖 · FEATURE_INTERIOR.
 * 등록하면 여러 인테리어 업체가 서로의 금액을 모른 채 밀봉 견적을 넣고,
 * 소비자만 전체 견적을 비교해 한 곳을 고른다.
 */

const CATEGORIES: InteriorCategory[] = ['RESIDENTIAL', 'COMMERCIAL'];

export function InteriorFormScreen() {
  const nav = useNavigation();
  const [category, setCategory] = useState<InteriorCategory>('RESIDENTIAL');
  const [region, setRegion] = useState('');
  const [title, setTitle] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (title.trim().length === 0) {
      setError('요청 제목을 입력해 주세요.');
      return;
    }
    if (siteAddress.trim().length === 0) {
      setError('현장 주소를 입력해 주세요.');
      return;
    }
    if (region.trim().length === 0) {
      setError('지역을 입력해 주세요. (예: 서울, 경기 양평)');
      return;
    }
    const budgetNum = Number(budget.replace(/\D/g, ''));
    setSubmitting(true);
    try {
      const created = await createInteriorRequest({
        region: region.trim(),
        category,
        title: title.trim(),
        description: description.trim(),
        siteAddress: siteAddress.trim(),
        budget: budget.trim() && budgetNum > 0 ? budgetNum : undefined,
      });
      nav.pop();
      nav.push({ name: 'interiorDetail', requestId: created.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '접수에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="인테리어 시공 요청" canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            여러 업체가 비밀 견적을 넣어요. 업체끼리는 서로 금액을 볼 수 없고, 회원님만 전체 견적을
            비교해 고를 수 있어요.
          </Text>
        </View>

        <FadeInUp delay={40}>
          <Text style={styles.fieldLabel}>공사 종류</Text>
          <View style={styles.segment}>
            {CATEGORIES.map((c) => {
              const selected = category === c;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setCategory(c)}
                  style={[styles.segmentItem, selected && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                    {INTERIOR_CATEGORY_LABELS[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="요청 제목"
            value={title}
            onChangeText={setTitle}
            placeholder="예) 30평 아파트 전체 리모델링"
          />
          <Field
            label="지역"
            value={region}
            onChangeText={setRegion}
            placeholder="예) 서울, 경기 양평, 부산"
          />
          <AddressPickerField
            label="현장 주소"
            value={siteAddress}
            onChangeAddress={(addr, reg) => {
              setSiteAddress(addr);
              if (reg) setRegion(reg);
            }}
            placeholder="예) ○○시 ○○구 ○○동 12-3"
            hint="주소를 검색하거나 지도를 움직여 현장 위치를 정확히 맞춰주세요."
          />
          <Field
            label="상세 요구사항"
            value={description}
            onChangeText={setDescription}
            placeholder="예) 주방·욕실 포함, 도배·바닥 전체 교체"
            multiline
            style={styles.multiline}
          />
          <Field
            label="희망 예산 (원, 선택)"
            value={budget}
            onChangeText={setBudget}
            placeholder="예) 20000000"
            keyboardType="number-pad"
            hint="적어두면 업체가 예산에 맞춰 견적을 내요. 비워도 돼요."
          />
        </FadeInUp>

        <ErrorBanner message={error} />
      </ScrollView>
      <StickyFooter>
        <AppButton label="견적 요청하기" onPress={submit} loading={submitting} />
      </StickyFooter>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  infoBox: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  infoText: {
    color: '#1E5FBF',
    fontSize: font.body,
    lineHeight: font.body + 6,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  segmentItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: radius.button,
    borderWidth: 2,
    flex: 1,
    marginRight: spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  multiline: {
    minHeight: 96,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
});
