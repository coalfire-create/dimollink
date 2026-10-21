import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  REQUEST_KIND_LABELS,
  asbestosRisk,
  resolveFloorArea,
  type RankedJob,
} from '@dimol/shared';
import { Card } from '../../components/ui';
import { theme } from '../../theme';
import { TABULAR_NUMS } from '../../lib/format';
import { requestSubtitle, requestTons } from '../../lib/request-summary';

/**
 * 새 철거 요청 카드 — 견적을 낼지 말지 **목록에서 바로 판단할 수 있게** 하는 요약.
 *
 * 거리·톤수만 보고는 들어갈 만한 일인지 알 수 없다. 금액을 크게 흔드는 세 가지
 * (연면적 · 석면 · 사진 유무)를 카드에 미리 얹어, 열어 볼 요청을 고르게 한다.
 */
export function DemolitionJobCard({ job, onPress }: { job: RankedJob; onPress: () => void }) {
  const details = job.kind === 'DEMOLITION' ? job.demolitionDetails : undefined;
  const area = resolveFloorArea(details);
  const risk = asbestosRisk(details?.buildingLedger);
  const riskIsReal = risk === 'HIGH' || risk === 'POSSIBLE';

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.title}>{REQUEST_KIND_LABELS[job.kind]}</Text>
        {job.distanceKm != null ? <Text style={styles.distance}>{job.distanceKm}km</Text> : null}
      </View>
      <Text style={styles.meta}>{requestSubtitle(job)}</Text>

      <View style={styles.signalRow}>
        {area ? (
          <View style={styles.signal}>
            <Text style={styles.signalText}>연면적 {area.m2.toLocaleString('ko-KR')}㎡</Text>
          </View>
        ) : null}
        {/* 실사 전 철거는 물량이 0 이라 "0톤"이 모든 카드에 똑같이 붙는다 — 모를 땐 비운다. */}
        {requestTons(job) ? (
          <View style={styles.signal}>
            <Text style={styles.signalText}>{requestTons(job)}</Text>
          </View>
        ) : null}
        <View style={styles.signal}>
          <Text style={styles.signalText}>사진 {job.sitePhotoKeys.length}장</Text>
        </View>
        {riskIsReal ? (
          <View style={[styles.signal, styles.signalWarn]}>
            <Text style={[styles.signalText, styles.signalWarnText]}>
              {ASBESTOS_RISK_LABELS[risk]}
            </Text>
          </View>
        ) : null}
      </View>

      {/* CTA 를 왼쪽에 둔다 — 오른쪽 아래는 고객센터 플로팅 버튼이 지나가는 자리라
          거기에 두면 목록을 스크롤할 때 버튼에 가린다. */}
      <View style={styles.jobFooter}>
        <Text style={styles.jobCta}>견적 산정하기</Text>
        <Text style={styles.jobDate}>
          {new Date(job.createdAt).toLocaleDateString('ko-KR')} 접수
        </Text>
      </View>
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  distance: {
    ...TABULAR_NUMS,
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  signal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.badge,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
  },
  signalWarn: {
    backgroundColor: theme.colors.warningSoft,
  },
  signalText: {
    ...TABULAR_NUMS,
    color: theme.colors.textMuted,
    fontSize: theme.font.caption,
    fontWeight: '700',
  },
  signalWarnText: {
    color: theme.colors.warning,
  },
  jobFooter: {
    alignItems: 'center',
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  jobCta: {
    color: theme.colors.primary,
    fontSize: theme.font.body,
    fontWeight: '800',
  },
  jobDate: {
    color: theme.colors.textMuted,
    fontSize: theme.font.caption,
  },
});
