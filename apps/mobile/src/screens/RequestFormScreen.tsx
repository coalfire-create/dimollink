import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { RequestKind } from '@dimol/shared';
import {
  AppButton,
  ErrorBanner,
  FieldError,
  KeyboardAwareScreen,
  StickyFooter,
} from '../components/ui';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ConfirmModal } from '../components/ConfirmModal';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { GuidedSiteCaptureModal } from '../components/GuidedSiteCaptureModal';
import { WasteItemsInput } from '../components/WasteItemsInput';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession, type RequestFormPrefill } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { AllbaroConsent } from './request-form/AllbaroConsent';
import { DemolitionSection } from './request-form/DemolitionSection';
import { DisposalSection } from './request-form/DisposalSection';
import { ReservationDone } from './request-form/ReservationDone';
import { TransportPhotoButtons, TransportSection } from './request-form/TransportSection';
import { useRequestForm } from './request-form/useRequestForm';
import './request-form/calendarLocale';
import { theme } from '../theme';

/**
 * 요청 접수 폼 — 종류(철거·운반·처리장 예약)에 따라 들어가는 섹션이 다르다.
 *
 * 이 파일은 **배치만** 한다: 어떤 섹션을 어떤 순서로 놓을지, 공통 껍데기(헤더·경로·접수
 * 버튼·모달)를 무엇으로 할지. 상태와 규칙은 전부 [[useRequestForm]] 에 있고,
 * 각 섹션은 `screens/request-form/` 아래 자기 파일에 있다.
 * (예전에는 셋이 한 파일에 1700줄로 엉켜 있어서, 운반 문구 하나를 고치려 해도
 *  철거 사진 분석 코드를 스크롤해 지나가야 했다.)
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
  const form = useRequestForm(kind, prefill);

  if (form.reservationDone) return <ReservationDone form={form} />;

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScreenHeader title={KIND_TITLES[kind]} canGoBack />
      <Breadcrumbs
        items={[
          { label: '홈', onPress: () => nav.switchTab('home') },
          { label: ROLE_CONFIG[user.userType].listTitle, onPress: () => nav.switchTab('requests') },
          { label: KIND_TITLES[kind] },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pilotChip}>
          <Text style={styles.pilotChipText}>전국 · 건설폐기물</Text>
        </View>
        {/* 지역은 주소에서 자동으로 따라오므로 별도 입력칸이 없다 — 오류만 여기서 알린다. */}
        <FieldError message={form.fieldErrors.region} />

        <FadeInUp delay={40}>
          {kind === 'DEMOLITION' ? <DemolitionSection form={form} /> : null}
          {kind === 'TRANSPORT' ? <TransportSection form={form} /> : null}
          {kind === 'DISPOSAL_RESERVATION' ? <DisposalSection form={form} /> : null}

          {kind === 'TRANSPORT' ? <TransportPhotoButtons form={form} /> : null}

          {kind !== 'DEMOLITION' ? (
            <>
              <WasteItemsInput
                items={form.wasteDrafts}
                onChange={(items) => {
                  form.setWasteDrafts(items);
                  form.clearFieldError('wasteItems');
                }}
              />
              <FieldError message={form.fieldErrors.wasteItems} />
            </>
          ) : null}
        </FadeInUp>

        <AllbaroConsent form={form} />
      </ScrollView>

      <StickyFooter>
        {/* 오류를 스크롤 안쪽에 두면, 화면 위쪽에서 고정 CTA 를 눌렀을 때
            메시지가 화면 밖에 떠서 "눌러도 아무 일이 없다"로 보인다. */}
        <ErrorBanner message={form.error} />
        <AppButton
          label="접수하기"
          onPress={form.submit}
          loading={form.submitting}
          disabled={form.submitting}
        />
      </StickyFooter>

      <ConfirmModal
        visible={form.leaveConfirmOpen}
        title="작성 중인 내용이 있어요"
        description="지금 나가면 이 화면은 닫히지만, 쓰던 내용은 임시 저장돼 있어요. 다시 들어오면 이어서 작성할 수 있어요."
        confirmLabel="나가기"
        cancelLabel="계속 작성"
        onConfirm={form.leaveWithoutSaving}
        onCancel={() => form.setLeaveConfirmOpen(false)}
      />

      <CameraCaptureModal
        visible={form.cameraOpen}
        onClose={() => form.setCameraOpen(false)}
        onCapture={form.handleCameraCapture}
      />

      <GuidedSiteCaptureModal
        visible={form.guidedOpen}
        onClose={() => form.setGuidedOpen(false)}
        onComplete={form.handleGuidedComplete}
      />

      {form.showDatePicker ? (
        <DateTimePicker
          value={
            form.datePickerTarget === 'visitAt' && form.visitAt
              ? new Date(form.visitAt)
              : new Date()
          }
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            form.setShowDatePicker(false);
            if (event.type === 'set' && selectedDate && form.datePickerTarget === 'visitAt') {
              form.setVisitAt(selectedDate.toISOString().split('T')[0]);
            }
          }}
        />
      ) : null}
    </KeyboardAwareScreen>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 140, // StickyFooter 및 안전영역에 가려지지 않도록 넉넉한 하단 공간 확보
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
});
