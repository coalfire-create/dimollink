import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON,
  PILOT,
  wasteItemsToTons,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import { ApiError, createRequest } from '../api/client';
import { AppButton, ErrorBanner, Field, StickyFooter } from '../components/ui';
import {
  WasteItemsInput,
  draftsToWasteItems,
  emptyWasteDraft,
  wasteItemsToDrafts,
  type WasteItemDraft,
} from '../components/WasteItemsInput';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession, type RequestFormPrefill } from '../navigation';
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

export function RequestFormScreen({
  kind,
  prefill,
}: {
  kind: RequestKind;
  prefill?: RequestFormPrefill;
}) {
  const nav = useNavigation();
  const user = useSession();
  const [wasteDrafts, setWasteDrafts] = useState<WasteItemDraft[]>(
    prefill?.wasteItems && prefill.wasteItems.length > 0
      ? wasteItemsToDrafts(prefill.wasteItems)
      : [emptyWasteDraft()],
  );
  const [region, setRegion] = useState(prefill?.region ?? user.region ?? '');
  const [siteAddress, setSiteAddress] = useState('');
  const [loadAddress, setLoadAddress] = useState(prefill?.loadAddress ?? '');
  const [unloadAddress, setUnloadAddress] = useState(prefill?.unloadAddress ?? '');
  const [visitAt, setVisitAt] = useState('');
  const [allbaroRequested, setAllbaroRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 처리장 예약 접수 직후 "운반요청도 함께 하기" 연계 스텝을 띄우기 위한 상태.
  const [reservationDone, setReservationDone] = useState<ServiceRequest | null>(null);

  const wasteItems = draftsToWasteItems(wasteDrafts);
  const tons = wasteItemsToTons(wasteItems);
  const allbaroMandatory = tons >= ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON;

  async function submit() {
    setError(null);
    if (region.trim().length === 0) {
      setError('지역을 입력해 주세요. (예: 서울, 경기 양평)');
      return;
    }
    if (wasteItems.length === 0) {
      setError('폐기물 소재를 1개 이상 선택하고 예상 무게(kg)를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createRequest({
        kind,
        requesterId: user.id,
        region: region.trim(),
        wasteCategory: PILOT.wasteCategory,
        wasteItems,
        allbaroRequested,
        location: prefill?.location,
        linkedRequestId: prefill?.linkedRequestId,
        siteAddress: kind === 'DEMOLITION' ? siteAddress.trim() : undefined,
        loadAddress: kind === 'TRANSPORT' ? loadAddress.trim() : undefined,
        unloadAddress: kind === 'TRANSPORT' ? unloadAddress.trim() : undefined,
        // 파일럿: 날짜만 입력받아 정오(KST) 방문으로 접수한다.
        visitAt: kind === 'DISPOSAL_RESERVATION' ? `${visitAt.trim()}T12:00:00+09:00` : undefined,
      });
      // 처리장 예약이 접수되면 바로 상세로 가지 않고 "운반요청도 함께 하기" 연계 스텝을 띄운다.
      if (kind === 'DISPOSAL_RESERVATION') {
        setReservationDone(created);
        setSubmitting(false);
        return;
      }
      nav.pop();
      nav.push({ name: 'requestDetail', requestId: created.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '접수에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  // 연계 스텝: 같은 소재/무게/좌표를 프리필한 운반요청 폼으로 이동(두 요청을 linkedRequestId 로 묶음).
  function goTransportLink() {
    const done = reservationDone;
    if (!done) return;
    nav.pop();
    nav.push({
      name: 'requestForm',
      kind: 'TRANSPORT',
      prefill: {
        wasteItems,
        region: done.region,
        location: done.location,
        linkedRequestId: done.id,
      },
    });
  }

  function finishReservation() {
    const done = reservationDone;
    if (!done) return;
    nav.pop();
    nav.push({ name: 'requestDetail', requestId: done.id });
  }

  if (reservationDone) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="예약 접수 완료" />
        <ScrollView contentContainerStyle={styles.content}>
          <FadeInUp>
            <View style={styles.doneCard}>
              <Text style={styles.doneEmoji}>✅</Text>
              <Text style={styles.doneTitle}>처리장 예약이 접수됐어요</Text>
              <Text style={styles.doneBody}>
                매칭된 처리장이 「운반요청 별도 필요」이면 폐기물을 처리장까지 옮길 운반이 따로 필요해요.
                지금 같은 소재·무게로 운반요청도 함께 접수할 수 있어요.
              </Text>
            </View>
          </FadeInUp>
        </ScrollView>
        <StickyFooter>
          <AppButton label="운반요청도 함께 하기" onPress={goTransportLink} />
          <Pressable
            onPress={finishReservation}
            accessibilityRole="button"
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>예약만 하고 마치기</Text>
          </Pressable>
        </StickyFooter>
      </View>
    );
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
          <>
            <Field
              label="방문 희망 날짜"
              value={visitAt}
              onChangeText={setVisitAt}
              placeholder="예) 2026-07-10"
              hint="날짜만 적어 주세요. 시간은 처리장과 협의해요."
            />
            {/* 운반요청 가능 여부 안내 — 매칭된 처리장 기준으로 예약 후 배지로 표시된다(운반 별도면 연계 안내). */}
            <View style={styles.transportInfo}>
              <Text style={styles.transportInfoText}>
                🚚 처리장마다 운반요청 가능 여부가 달라요. 예약 후 매칭된 처리장이
                「운반요청 별도 필요」면 운반요청을 함께 하도록 안내해 드려요.
              </Text>
            </View>
          </>
        ) : null}

        <WasteItemsInput items={wasteDrafts} onChange={setWasteDrafts} />
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
  doneCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
  },
  doneEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  doneTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  doneBody: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 8,
    textAlign: 'center',
  },
  secondaryBtn: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
  transportInfo: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  transportInfoText: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
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
