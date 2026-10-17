import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  MAX_SITE_VISITS_PER_REQUEST,
  countScheduledVisits,
  type DemolitionEstimate,
  type ProviderEstimateAccuracy,
} from '@dimol/shared';
import {
  ApiError,
  acceptDemolitionEstimate,
  cancelSiteVisit,
  getEstimateAccuracy,
  listDemolitionEstimates,
  scheduleSiteVisit,
} from '../../api/client';
import { AppButton, Card, ErrorBanner, IconTile, SectionTitle } from '../ui';
import { manwon } from '../../lib/format';
import { VisitPicker } from './VisitPicker';
import { theme } from '../../theme';

/**
 * 소비자용 철거 견적 비교 — 개산(범위) 확인 → 실사 예약 → 확정 견적 수락.
 *
 * 화면이 강조해야 할 것은 **개산은 아직 금액이 아니라는 사실**이다. 여기서 금액처럼
 * 보이면 사용자는 그 숫자로 결정하고, 확정에서 달라졌을 때 속았다고 느낀다.
 */

function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

/** 개산 정확도를 사람 말로. 표본이 적으면 숫자를 단정적으로 쓰지 않는다. */
function accuracyLabel(acc: ProviderEstimateAccuracy | undefined): string | null {
  if (!acc || acc.sampleCount === 0) return null;
  if (acc.sampleCount < 3) return `실적 ${acc.sampleCount}건 · 참고용`;
  const pct = Math.round((acc.averageDeviation ?? 0) * 100);
  const sign = pct > 0 ? '+' : '';
  return `개산 대비 확정 평균 ${sign}${pct}% · ${acc.sampleCount}건`;
}

export function EstimateComparison({
  requestId,
  onMatched,
}: {
  requestId: string;
  onMatched: () => void;
}) {
  const [estimates, setEstimates] = useState<DemolitionEstimate[]>([]);
  const [accuracy, setAccuracy] = useState<Record<string, ProviderEstimateAccuracy>>({});
  const [visitAt, setVisitAt] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listDemolitionEstimates(requestId);
      setEstimates(rows);
      // 정확도는 업체마다 한 번씩. 실패해도 견적 비교는 그대로 뜬다.
      const pairs = await Promise.all(
        rows.map(async (e) => {
          try {
            return [e.providerId, await getEstimateAccuracy(e.providerId)] as const;
          } catch {
            return null;
          }
        }),
      );
      setAccuracy(Object.fromEntries(pairs.filter((p): p is NonNullable<typeof p> => p !== null)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적을 불러오지 못했습니다.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>, fallback: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  if (estimates.length === 0) {
    return (
      <>
        <SectionTitle>받은 철거 견적</SectionTitle>
        <Card style={styles.emptyCard}>
          <IconTile icon="document" style={styles.emptyIcon} />
          <View style={styles.flex}>
            <Text style={styles.emptyTitle}>업체 견적을 기다리고 있어요</Text>
            <Text style={styles.hint}>
              업체가 사진과 건축물대장을 보고 예상 금액 범위를 보내면 여기에 모여요.
            </Text>
          </View>
        </Card>
        <ErrorBanner message={error} />
      </>
    );
  }

  const visitsUsed = countScheduledVisits(estimates);
  const visitsLeft = MAX_SITE_VISITS_PER_REQUEST - visitsUsed;
  return (
    <>
      <SectionTitle>받은 철거 견적 {estimates.length}건</SectionTitle>
      {/* 개산은 아직 금액이 아니다 — 카드보다 먼저, 짧게. */}
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>아직 확정 금액이 아니에요</Text>
        <Text style={styles.noticeBody}>
          현장 실사 후 금액이 정해져요. 실사는 최대 {MAX_SITE_VISITS_PER_REQUEST}곳까지 부를 수
          있어요 · 남은 횟수 {visitsLeft}회
        </Text>
      </View>
      <ErrorBanner message={error} />
      {[...estimates]
        .sort((a, b) => a.preliminary.minAmount - b.preliminary.minAmount)
        .map((e, index) => {
          const label = accuracyLabel(accuracy[e.providerId]);
          const overrun = e.final !== undefined && e.final.amount > e.preliminary.maxAmount;
          const name = e.providerName ?? '철거업체';
          return (
            <Card key={e.id} style={e.final ? styles.cardFinal : undefined}>
              <View style={styles.providerRow}>
                <IconTile label={name.trim().charAt(0) || '철'} style={styles.providerIcon} />
                <View style={styles.flex}>
                  <Text style={styles.provider}>{name}</Text>
                  {label ? <Text style={styles.accuracy}>{label}</Text> : null}
                </View>
                {index === 0 && !e.final ? (
                  <View style={styles.lowest}>
                    <Text style={styles.lowestText}>최저 예상</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.rangeBox}>
                <Text style={styles.rangeLabel}>예상 범위 (실사 전)</Text>
                <Text style={styles.range}>
                  {manwon(e.preliminary.minAmount)} ~ {manwon(e.preliminary.maxAmount)}
                </Text>
              </View>
              {e.preliminary.memo ? <Text style={styles.memo}>{e.preliminary.memo}</Text> : null}

              {e.final ? (
                <>
                  <View style={styles.finalBox}>
                    <Text style={styles.finalLabel}>확정 견적 (계약금액)</Text>
                    <Text style={styles.final}>{won(e.final.amount)}</Text>
                  </View>
                  {overrun ? (
                    <Text style={styles.overrun}>
                      예상 범위를 넘었어요 — {e.final.overrunReason}
                    </Text>
                  ) : null}
                  {e.final.memo ? <Text style={styles.memo}>{e.final.memo}</Text> : null}
                  <AppButton
                    label="이 견적으로 계약하기"
                    style={styles.action}
                    loading={busyId === e.id}
                    onPress={() =>
                      void run(
                        e.id,
                        async () => {
                          await acceptDemolitionEstimate(e.id);
                          onMatched();
                        },
                        '수락에 실패했습니다.',
                      )
                    }
                  />
                </>
              ) : e.visit ? (
                <>
                  <View style={styles.visitBox}>
                    <Text style={styles.visitLabel}>실사 예약</Text>
                    <Text style={styles.visitValue}>
                      {new Date(e.visit.scheduledAt).toLocaleString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.hint}>실사 후 업체가 확정 금액을 보내요.</Text>
                  <AppButton
                    label="실사 예약 취소"
                    variant="outline"
                    style={styles.action}
                    loading={busyId === e.id}
                    onPress={() =>
                      void run(e.id, () => cancelSiteVisit(e.id), '취소에 실패했습니다.')
                    }
                  />
                </>
              ) : (
                <>
                  <VisitPicker
                    value={visitAt[e.id]}
                    onChange={(iso) => setVisitAt((prev) => ({ ...prev, [e.id]: iso }))}
                  />
                  <AppButton
                    label={
                      visitsLeft > 0
                        ? '현장 실사 요청하기'
                        : `실사는 ${MAX_SITE_VISITS_PER_REQUEST}곳까지예요`
                    }
                    style={styles.action}
                    disabled={visitsLeft <= 0}
                    loading={busyId === e.id}
                    onPress={() => {
                      const iso = visitAt[e.id];
                      if (!iso) {
                        setError('실사 받을 날짜와 시간을 골라 주세요.');
                        return;
                      }
                      void run(e.id, () => scheduleSiteVisit(e.id, iso), '예약에 실패했습니다.');
                    }}
                  />
                </>
              )}
            </Card>
          );
        })}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5 },
  emptyCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  emptyIcon: {},
  emptyTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  notice: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  noticeTitle: { color: theme.colors.warning, fontSize: font.body, fontWeight: '800' },
  noticeBody: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  cardFinal: { borderColor: colors.primary, borderWidth: 2 },
  providerRow: { alignItems: 'center', flexDirection: 'row' },
  providerIcon: { marginRight: spacing.sm },
  provider: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  accuracy: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  lowest: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  lowestText: { color: colors.primary, fontSize: font.caption, fontWeight: '800' },
  rangeBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  rangeLabel: { color: colors.textMuted, fontSize: font.body },
  range: { color: colors.text, fontSize: font.title, fontWeight: '800', marginTop: spacing.xs / 2 },
  finalBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  finalLabel: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  final: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  overrun: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  visitBox: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  visitLabel: { color: colors.textMuted, fontSize: font.body },
  visitValue: { color: colors.text, fontSize: font.body, fontWeight: '800' },
  memo: { color: colors.textMuted, fontSize: font.body, lineHeight: 26, marginTop: spacing.xs },
  action: { marginTop: spacing.sm },
});
