import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { REMOTE_SURVEY_ITEMS, canSubmitRemoteSurvey } from '@dimol/shared';
import { AppButton, ErrorBanner, LoadingView, SectionTitle, StickyFooter } from '../components/ui';
import { ScreenHeader } from '../navigation';
import { ChecklistItemCard } from './remote-survey/ChecklistItemCard';
import { ExteriorCard } from './remote-survey/ExteriorCard';
import { QuestionnaireCard } from './remote-survey/QuestionnaireCard';
import { RoomsCard } from './remote-survey/RoomsCard';
import { ShotRequestList } from './remote-survey/ShotRequestList';
import { SurveyProgressCard } from './remote-survey/SurveyProgressCard';
import { useRemoteSurvey } from './remote-survey/useRemoteSurvey';
import { theme } from '../theme';

/**
 * 원격 실사 촬영 — 업체가 집에 오지 않아도 현장에서 보던 것을 그대로 보게 한다.
 *
 * 한 화면에 위에서 아래로: 진행률 → (보낸 뒤) 추가 촬영 요청 → 질문 → 사진 항목 → 보내기.
 * 질문을 사진보다 먼저 두는 이유: "지하가 있다"고 답하면 지하 입구 사진이 필수가 되는 것처럼
 * 답이 찍을 것을 정한다.
 *
 * 이 파일은 배치만 맡는다 — 데이터와 저장은 [[useRemoteSurvey]], 각 카드는
 * `screens/remote-survey/` 아래 자기 파일에 있다. 무엇이 필수인지는 shared 의 remote-survey.
 */
export function RemoteSurveyScreen({ requestId }: { requestId: string }) {
  const s = useRemoteSurvey(requestId);
  const { survey } = s;
  const busy = s.busyLabel !== null;

  if (!survey) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="원격 실사 촬영" canGoBack />
        {s.loading ? (
          <LoadingView />
        ) : (
          <View style={styles.content}>
            <ErrorBanner
              message={s.error ?? '원격 실사 자료를 불러오지 못했어요.'}
              onRetry={() => void s.load()}
            />
          </View>
        )}
      </View>
    );
  }

  const editable = survey.status === 'DRAFT';
  const gate = canSubmitRemoteSurvey(survey);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="원격 실사 촬영" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <SurveyProgressCard survey={survey} />
        {s.busyLabel ? (
          <Text style={styles.busy} accessibilityLiveRegion="polite">
            {s.busyLabel}… 잠시만 기다려 주세요.
          </Text>
        ) : null}
        <ErrorBanner message={s.error} />

        <ShotRequestList requests={s.shotRequests} busy={busy} onFulfil={s.fulfil} />

        {editable ? (
          <>
            <SectionTitle>1. 질문에 답해 주세요</SectionTitle>
            <QuestionnaireCard answers={survey.answers} busy={busy} onSave={s.saveAnswers} />

            <SectionTitle>2. 안내대로 찍어 주세요</SectionTitle>
            {REMOTE_SURVEY_ITEMS.map((item) => {
              if (item.capture === 'SCAN_OR_PHOTOS') {
                return (
                  <ExteriorCard
                    key={item.id}
                    item={item}
                    survey={survey}
                    busy={busy}
                    onPhotos={(photos) => void s.addItemPhotos(item.id, photos)}
                    onScanJob={(jobId) => void s.setScanJob(jobId)}
                  />
                );
              }
              if (item.capture === 'ROOMS') {
                return (
                  <RoomsCard
                    key={item.id}
                    item={item}
                    survey={survey}
                    busy={busy}
                    onAddRoom={(name) => void s.addRoom(name)}
                    onRemoveRoom={(roomId) => void s.removeRoom(roomId)}
                    onRoomPhotos={(roomId, photos) => void s.setRoomPhotos(roomId, photos)}
                  />
                );
              }
              return (
                <ChecklistItemCard
                  key={item.id}
                  item={item}
                  survey={survey}
                  busy={busy}
                  onPhotos={(photos) => void s.addItemPhotos(item.id, photos)}
                  onClear={() => void s.clearItemPhotos(item.id)}
                />
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {editable ? (
        <StickyFooter>
          {!gate.ok ? <Text style={styles.missing}>{gate.error}</Text> : null}
          <AppButton
            label="업체에 보내기"
            disabled={busy || !gate.ok}
            loading={s.busyLabel === '업체에 보내는 중이에요'}
            onPress={() => void s.submit()}
          />
        </StickyFooter>
      ) : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  busy: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  missing: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
  },
});
