import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON,
  PILOT,
  type RequestKind,
} from '@dimol/shared';
import { ApiError, createRequest } from '../api/client';
import { AppButton, ErrorBanner, Field, StickyFooter } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/**
 * 요청 작성 — 철거/운반/처리장예약 공용 폼 (Phase 1 /requests).
 * 5톤 이상 건설폐기물은 올바로 의무신고 대상 안내를 자동 표시하고,
 * "올바로 전자인계서 신고가 필요한 건인가요?" 체크박스를 제공한다 (핵심 비즈니스 규칙).
 */

const KIND_TITLES: Record<RequestKind, string> = {
  DEMOLITION: '철거 요청',
  TRANSPORT: '운반 요청',
  DISPOSAL_RESERVATION: '처리장 예약',
};

export function RequestFormScreen({ kind }: { kind: RequestKind }) {
  const nav = useNavigation();
  const user = useSession();
  const [wasteTons, setWasteTons] = useState('');
  const [region, setRegion] = useState(user.region ?? '');
  const [siteAddress, setSiteAddress] = useState('');
  const [loadAddress, setLoadAddress] = useState('');
  const [unloadAddress, setUnloadAddress] = useState('');
  const [visitAt, setVisitAt] = useState('');
  const [allbaroRequested, setAllbaroRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tons = Number(wasteTons);
  const allbaroMandatory =
    Number.isFinite(tons) && tons >= ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON;

  async function submit() {
    setError(null);
    if (region.trim().length === 0) {
      setError('지역을 입력해 주세요. (예: 서울, 경기 양평)');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createRequest({
        kind,
        requesterId: user.id,
        region: region.trim(),
        wasteCategory: PILOT.wasteCategory,
        wasteTons: tons,
        allbaroRequested,
        siteAddress: kind === 'DEMOLITION' ? siteAddress.trim() : undefined,
        loadAddress: kind === 'TRANSPORT' ? loadAddress.trim() : undefined,
        unloadAddress: kind === 'TRANSPORT' ? unloadAddress.trim() : undefined,
        // 파일럿: 날짜만 입력받아 정오(KST) 방문으로 접수한다.
        visitAt: kind === 'DISPOSAL_RESERVATION' ? `${visitAt.trim()}T12:00:00+09:00` : undefined,
      });
      nav.pop();
      nav.push({ name: 'requestDetail', requestId: created.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '접수에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KIND_TITLES[kind]} canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pilotChip}>
          <Text style={styles.pilotChipText}>전국 · 건설폐기물</Text>
        </View>

       <FadeInUp delay={40}>
        <Field
          label="지역"
          value={region}
          onChangeText={setRegion}
          placeholder="예) 서울, 경기 양평, 부산"
          hint="현장이 위치한 지역이에요."
        />
        {kind === 'DEMOLITION' ? (
          <Field
            label="현장 주소"
            value={siteAddress}
            onChangeText={setSiteAddress}
            placeholder="예) ○○시 ○○구 ○○동 12-3"
          />
        ) : null}
        {kind === 'TRANSPORT' ? (
          <>
            <Field
              label="상차지 주소 (폐기물을 싣는 곳)"
              value={loadAddress}
              onChangeText={setLoadAddress}
              placeholder="예) ○○시 ○○구 ○○동 12-3"
            />
            <Field
              label="하차지 주소 (폐기물을 내리는 곳)"
              value={unloadAddress}
              onChangeText={setUnloadAddress}
              placeholder="예) ○○시 ○○구 처리장"
            />
          </>
        ) : null}
        {kind === 'DISPOSAL_RESERVATION' ? (
          <Field
            label="방문 희망 날짜"
            value={visitAt}
            onChangeText={setVisitAt}
            placeholder="예) 2026-07-10"
            hint="날짜만 적어 주세요. 시간은 처리장과 협의해요."
          />
        ) : null}

        <Field
          label="폐기물 예상 무게 (톤)"
          value={wasteTons}
          onChangeText={setWasteTons}
          placeholder="예) 7"
          keyboardType="numeric"
          hint="잘 모르면 홈의 '폐기물 양 미리 계산'을 이용해 보세요."
        />
        <View style={styles.presetRow}>
          <Text style={styles.presetTitle}>빠른 선택:</Text>
          {['3', '5', '10', '15'].map((t) => (
            <Pressable
              key={t}
              style={[styles.presetChip, wasteTons === t && styles.presetChipActive]}
              onPress={() => setWasteTons(t)}
            >
              <Text style={[styles.presetChipText, wasteTons === t && styles.presetChipTextActive]}>
                {t}톤{t === '5' ? ' (의무)' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
       </FadeInUp>

        {allbaroMandatory ? (
          <FadeInUp>
            <View style={styles.mandatoryNotice}>
              <Text style={styles.mandatoryTitle}>♻️ 올바로 신고 대상</Text>
              <Text style={styles.mandatoryBody}>
                {ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON}톤 이상은 전자인계서 의무 대상이에요. 켜 두면 자동으로 처리해 드려요.
              </Text>
            </View>
          </FadeInUp>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allbaroRequested }}
          onPress={() => setAllbaroRequested((v) => !v)}
          style={[styles.checkboxRow, allbaroRequested && styles.checkboxRowChecked]}
        >
          <Text style={styles.checkboxMark}>{allbaroRequested ? '☑' : '☐'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkboxLabel}>올바로 전자인계서 신고</Text>
            <Text style={styles.checkboxHint}>
              {allbaroRequested ? '자동 발행해 드려요' : '자체 간이 확인서로 대체'}
            </Text>
          </View>
        </Pressable>

        <ErrorBanner message={error} />
      </ScrollView>
      <StickyFooter>
        <AppButton label="접수하기" onPress={submit} loading={submitting} />
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
  pilotChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 6,
    flexWrap: 'wrap',
  },
  presetTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 4,
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  presetChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  mandatoryNotice: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  mandatoryTitle: {
    color: '#1E5FBF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  mandatoryBody: {
    color: '#1E5FBF',
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  checkboxRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  checkboxRowChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.primary,
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  checkboxHint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
});
