import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resolveFloorArea } from '@dimol/shared';
import { MyEstimateCard } from '../../components/demolition/MyEstimateCard';
import { AppButton, Card, ErrorBanner, LoadingView, SectionTitle } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';
import { useRemoteEstimate } from './useRemoteEstimate';

/**
 * 확정 견적 탭 — 실사 방식(방문/원격) 확인 → "원격 실사로 진행" → 확정 금액.
 *
 * 확정 금액 입력은 견적 산정 화면과 같은 카드(MyEstimateCard)를 쓴다 — 개산 초과 사유 같은
 * 규칙이 화면마다 갈라지면 안 된다. 원격으로 기록돼야 정합성 표본([[estimate-parity]])에 잡힌다.
 */
export function EstimateTab({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const e = useRemoteEstimate(requestId);

  if (e.loading) return <LoadingView />;

  if (!e.mine || !e.request) {
    return (
      <View>
        <ErrorBanner message={e.error} onRetry={() => void e.reload()} />
        <Card>
          <Text style={styles.hint}>
            아직 이 요청에 개산 견적을 내지 않았어요. 개산을 먼저 내야 실사·확정으로 넘어갈 수
            있어요.
          </Text>
          <AppButton
            label="견적 산정 화면으로"
            onPress={() => nav.push({ name: 'estimateWorksheet', requestId })}
            style={styles.button}
          />
        </Card>
      </View>
    );
  }

  const { mine, request } = e;
  const details = request.demolitionDetails;
  const visitLabel = !mine.visit
    ? '아직 실사 전'
    : e.isRemote
      ? mine.visit.remoteSurveyId
        ? '원격 실사(보내 준 사진·자료 기준)'
        : '원격 실사(영상통화)'
      : `방문 실사 · ${new Date(mine.visit.scheduledAt).toLocaleString('ko-KR')}`;

  return (
    <View>
      <SectionTitle>실사 방식</SectionTitle>
      <Card>
        <Text style={styles.mode}>{visitLabel}</Text>
        {e.canMarkRemote ? (
          <>
            <Text style={styles.hint}>
              {e.convertsInPerson
                ? '신청자가 방문 실사를 잡아 두었어요. 원격으로 바꾸면 신청자에게 "방문하지 않는다"고 알림이 가요.'
                : '현장에 가지 않고, 신청자가 보낸 사진·자료로 실사를 마칩니다. 그다음 바로 확정 금액을 낼 수 있어요.'}
            </Text>
            <AppButton
              label={e.convertsInPerson ? '방문 대신 원격 실사로 진행' : '원격 실사로 진행'}
              onPress={e.markRemote}
              loading={e.busy}
              disabled={e.busy}
              style={styles.button}
            />
          </>
        ) : !e.survey && !mine.final ? (
          <Text style={styles.hint}>
            신청자가 원격 실사 자료를 보내면 현장에 가지 않고 실사를 마칠 수 있어요.
          </Text>
        ) : null}
      </Card>

      <MyEstimateCard
        mine={mine}
        area={resolveFloorArea(details)}
        wasteTons={request.wasteTons}
        busy={e.busy}
        error={e.error}
        onSubmitFinal={e.submitFinal}
      />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  mode: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28, marginTop: spacing.xs },
  button: { marginTop: spacing.sm },
});
