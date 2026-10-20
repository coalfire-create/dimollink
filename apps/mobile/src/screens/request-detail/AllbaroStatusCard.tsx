import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServiceRequest } from '@dimol/shared';
import { Card, IconTile } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 올바로 전자인계서 카드 — 이 요청이 자동 신고 대상인지, 언제 발행되는지.
 *
 * 예전에는 요청 정보 맨 아래 "올바로 신고: 신청함" 한 줄뿐이라 이 앱의 가장 큰 차별점이
 * 눈에 띄지 않았다. 앱은 건별 발행 결과를 받지 않으므로 "발행 완료"라고 단정하지 않고,
 * 규칙(매칭 확정 시 발행 · 장애 시 간이확인서로 대체 후 재시도)만 정확히 보여준다.
 */
const FLOW = ['배출자', '운반자', '처리자'];

export function AllbaroStatusCard({ request }: { request: ServiceRequest }) {
  const manifest = request.allbaroManifest;
  if ((!request.allbaroRequested && !manifest) || request.status === 'CANCELLED') return null;
  const waiting = request.status === 'REQUESTED';

  const docNumber =
    manifest?.route === 'ALLBARO_API' ? manifest.manifestNo : manifest?.simpleConfirmNo;
  const docLabel = manifest?.route === 'ALLBARO_API' ? '전자인계서 번호' : '간이확인서 번호';

  let bodyText: string;
  if (manifest?.route === 'ALLBARO_API') {
    bodyText = '환경부 올바로시스템에 전자인계서가 정식 발행됐어요.';
  } else if (manifest?.route === 'RETRY_QUEUED') {
    bodyText =
      '올바로 일시 지연으로 간이확인서를 먼저 발급했어요. 백그라운드에서 전자인계서 자동 재발행을 진행 중이에요.';
  } else if (manifest?.route === 'SIMPLE_CONFIRM') {
    bodyText = '자체 간이확인서가 발급됐어요.';
  } else if (waiting) {
    bodyText = '업체 매칭이 확정되면 인계서를 자동으로 발행해요.';
  } else {
    bodyText =
      '매칭 확정과 함께 발행 절차가 시작됐어요. 올바로 장애 시에는 간이확인서로 대신하고 다시 시도해요.';
  }

  return (
    <Card>
      <View style={styles.header}>
        <IconTile icon="document" tone="solid" style={styles.icon} />
        <View style={styles.flex}>
          <Text style={styles.title}>올바로 전자인계서</Text>
          <Text style={styles.sub}>환경부 폐기물 신고 자동 발행</Text>
        </View>
      </View>
      <View style={styles.flow}>
        {FLOW.map((step, i) => (
          <React.Fragment key={step}>
            <View style={styles.step}>
              <Text style={styles.stepText}>{step}</Text>
            </View>
            {i < FLOW.length - 1 ? <Text style={styles.arrow}>›</Text> : null}
          </React.Fragment>
        ))}
      </View>
      {docNumber || request.actualWeighedTons !== undefined ? (
        <View style={styles.metaBox}>
          {docNumber ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{docLabel}</Text>
              <Text style={styles.metaValue}>{docNumber}</Text>
            </View>
          ) : null}
          {request.actualWeighedTons !== undefined ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>처리장 실측 중량</Text>
              <Text style={styles.metaValue}>{request.actualWeighedTons}톤</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.body}>{bodyText}</Text>
    </Card>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row' },
  icon: { marginRight: spacing.sm },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  flow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  step: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  stepText: { color: colors.primary, fontSize: font.body, fontWeight: '800' },
  arrow: { color: colors.textMuted, fontSize: font.title },
  metaBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: { color: colors.textMuted, fontSize: font.body },
  metaValue: { color: colors.text, fontSize: font.body, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: font.body, lineHeight: 26, marginTop: spacing.sm },
});
