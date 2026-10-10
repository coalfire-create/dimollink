import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  PARITY_MIN_SAMPLES,
  PARITY_PASS_SHARE,
  PARITY_TARGET_RATIO,
  PARITY_VERDICT_LABELS,
  type ParityVerdict,
} from '@dimol/shared';
import {
  adminGetEstimateParity,
  adminRefreshEstimateParity,
  type ParityOverview,
} from '../../api/client';
import { alertDialog } from '../../lib/dialog';
import { AppButton, Card, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';
import { ParityManualForm } from './ParityManualForm';
import { ParitySampleRow, formatRatio } from './ParitySampleRow';
import { Empty, Hint, adminStyles as s, errorMessage } from './shared';
import type { AdminTabProps } from './shared';

/**
 * 원격 vs 방문 견적 정합성(시범 측정).
 *
 * "원격 견적이 방문 견적과 거의 같다"를 숫자로 보여준다. 방문 견적끼리도 업체마다
 * 10~20% 차이가 나므로, 기준은 "원격 차이가 방문 업체끼리의 차이보다 크지 않고
 * 대부분 ±10% 안"이다. 계산·판정은 서버(공유 [[estimate-parity]])가 한다.
 */
export function EstimateParityTab({ token, onError }: AdminTabProps) {
  const [data, setData] = useState<ParityOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void adminGetEstimateParity(token)
      .then(setData)
      .catch((err: unknown) => onError(errorMessage(err, '정합성 보고서 조회에 실패했습니다.')))
      .finally(() => setLoading(false));
  }, [token, onError]);

  useEffect(load, [load]);

  async function refreshAuto() {
    setRefreshing(true);
    try {
      const result = await adminRefreshEstimateParity(token);
      setData({ report: result.report, samples: result.samples });
      const { created, updated, removed } = result.summary;
      alertDialog('다시 계산했어요', `새로 ${created}곳 · 갱신 ${updated}곳 · 삭제 ${removed}곳`);
    } catch (err) {
      onError(errorMessage(err, '다시 계산에 실패했습니다.'));
    } finally {
      setRefreshing(false);
    }
  }

  const report = data?.report;

  return (
    <>
      <SectionTitle>원격 견적 정합성</SectionTitle>
      <Hint>
        같은 현장을 원격으로 본 견적과 직접 방문한 견적을 비교합니다. 목표는 차이가 ±
        {formatRatio(PARITY_TARGET_RATIO)} 안인 현장이 {formatRatio(PARITY_PASS_SHARE)} 이상이고,
        방문 업체끼리의 차이보다 크지 않은 것입니다.
      </Hint>

      <Card>
        {!report ? (
          <Empty>{loading ? '불러오는 중…' : '보고서가 없어요.'}</Empty>
        ) : (
          <>
            <Text style={[styles.verdict, verdictStyle(report.verdict)]}>
              {PARITY_VERDICT_LABELS[report.verdict]}
            </Text>
            <Metric label="비교한 현장" value={`${report.n}곳 (최소 ${PARITY_MIN_SAMPLES}곳)`} />
            <Metric label="차이 중앙값" value={formatRatio(report.medianAbsDiff)} />
            <Metric label="현장 80%의 차이 상한" value={formatRatio(report.p80AbsDiff)} />
            <Metric
              label={`±${formatRatio(PARITY_TARGET_RATIO)} 안 비율`}
              value={formatRatio(report.shareWithinTarget)}
            />
            <Metric
              label="방문 업체끼리 차이(중앙값)"
              value={formatRatio(report.spread.medianInPersonSpread)}
            />
            <Metric
              label="실적 톤 대비 추정 오차"
              value={
                report.tonnage.sitesWithActual > 0
                  ? `${formatRatio(report.tonnage.medianAbsTonError)} (${report.tonnage.sitesWithActual}곳)`
                  : '실적 없음'
              }
            />
            {report.reasons.map((reason) => (
              <Text key={reason} style={s.meta}>
                · {reason}
              </Text>
            ))}
            {report.excluded > 0 ? (
              <Text style={s.warn}>금액이 비어 비교하지 못한 표본 {report.excluded}개</Text>
            ) : null}
          </>
        )}
      </Card>

      <View style={s.spacer} />
      <AppButton
        label="플랫폼 견적에서 다시 계산"
        variant="outline"
        onPress={() => void refreshAuto()}
        loading={refreshing}
      />

      <SectionTitle>현장별 결과 ({data?.samples.length ?? 0})</SectionTitle>
      {!data || data.samples.length === 0 ? (
        <Empty>아직 표본이 없어요. 아래에서 시범 현장을 입력하세요.</Empty>
      ) : (
        data.samples.map((sample) => (
          <ParitySampleRow
            key={sample.id}
            token={token}
            sample={sample}
            site={report?.sites.find((r) => r.sampleId === sample.id)}
            onChanged={load}
            onError={onError}
          />
        ))
      )}

      <SectionTitle>시범 현장 입력</SectionTitle>
      <ParityManualForm token={token} onSaved={load} onError={onError} />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function verdictStyle(verdict: ParityVerdict) {
  if (verdict === 'PASS') return styles.pass;
  if (verdict === 'FAIL') return styles.fail;
  return styles.pending;
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  verdict: { fontSize: font.title, fontWeight: '800', marginBottom: spacing.xs },
  pass: { color: colors.primary },
  fail: { color: colors.error },
  pending: { color: colors.textMuted },
});
