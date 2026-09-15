import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
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
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../ui';
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
  if (acc.sampleCount < 3) return `실적 ${acc.sampleCount}건 (아직 판단하기 이릅니다)`;
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
        <SectionTitle>철거 견적</SectionTitle>
        <Card>
          <Text style={styles.hint}>
            아직 받은 개산 견적이 없습니다. 업체가 사진과 건축물대장을 보고 예상 범위를 보내오면
            여기에 표시됩니다.
          </Text>
        </Card>
        <ErrorBanner message={error} />
      </>
    );
  }

  const visitsUsed = countScheduledVisits(estimates);
  const visitsLeft = MAX_SITE_VISITS_PER_REQUEST - visitsUsed;

  return (
    <>
      <SectionTitle>철거 견적 ({estimates.length})</SectionTitle>
      <Text style={styles.hint}>
        <Text style={styles.strong}>아래 금액은 아직 확정이 아닙니다.</Text> 사진만으로는 지하
        구조물·석면 범위를 알 수 없어, 현장 실사 후에 금액이 정해집니다. 마음에 드는 곳
        <Text style={styles.strong}> 최대 {MAX_SITE_VISITS_PER_REQUEST}곳</Text>까지 실사를 부를 수
        있습니다. (남은 횟수 {visitsLeft}회)
      </Text>
      <ErrorBanner message={error} />

      {[...estimates]
        .sort((a, b) => a.preliminary.minAmount - b.preliminary.minAmount)
        .map((e) => {
          const label = accuracyLabel(accuracy[e.providerId]);
          const overrun = e.final !== undefined && e.final.amount > e.preliminary.maxAmount;
          return (
            <Card key={e.id}>
              <Text style={styles.provider}>{e.providerName ?? '철거업체'}</Text>
              {label ? <Text style={styles.accuracy}>{label}</Text> : null}

              <Text style={styles.rangeLabel}>개산 (실사 전 예상)</Text>
              <Text style={styles.range}>
                {won(e.preliminary.minAmount)} ~ {won(e.preliminary.maxAmount)}
              </Text>
              {e.preliminary.memo ? <Text style={styles.memo}>{e.preliminary.memo}</Text> : null}

              {e.final ? (
                <>
                  <Text style={styles.finalLabel}>확정 견적 (계약금액)</Text>
                  <Text style={styles.final}>{won(e.final.amount)}</Text>
                  {overrun ? (
                    <Text style={styles.overrun}>
                      개산 범위를 넘었습니다 — {e.final.overrunReason}
                    </Text>
                  ) : null}
                  {e.final.memo ? <Text style={styles.memo}>{e.final.memo}</Text> : null}
                  <AppButton
                    label="이 견적으로 계약"
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
                  <Text style={styles.visitLabel}>
                    실사 예약 {new Date(e.visit.scheduledAt).toLocaleString('ko-KR')}
                  </Text>
                  <Text style={styles.hint}>
                    실사 후 업체가 확정 금액을 보냅니다. 일정 조율은 대화에서 하세요.
                  </Text>
                  <AppButton
                    label="실사 예약 취소"
                    variant="outline"
                    loading={busyId === e.id}
                    onPress={() =>
                      void run(e.id, () => cancelSiteVisit(e.id), '취소에 실패했습니다.')
                    }
                  />
                </>
              ) : (
                <>
                  <Field
                    label="실사 희망 일시"
                    value={visitAt[e.id] ?? ''}
                    onChangeText={(v) => setVisitAt((prev) => ({ ...prev, [e.id]: v }))}
                    placeholder="예: 2026-09-20 14:00"
                  />
                  <AppButton
                    label={
                      visitsLeft > 0
                        ? '현장 실사 요청'
                        : `실사는 ${MAX_SITE_VISITS_PER_REQUEST}곳까지`
                    }
                    disabled={visitsLeft <= 0}
                    loading={busyId === e.id}
                    onPress={() => {
                      const raw = (visitAt[e.id] ?? '').trim();
                      const parsed = new Date(raw.replace(' ', 'T'));
                      if (!raw || Number.isNaN(parsed.getTime())) {
                        setError('실사 희망 일시를 "2026-09-20 14:00" 형식으로 입력해 주세요.');
                        return;
                      }
                      void run(
                        e.id,
                        () => scheduleSiteVisit(e.id, parsed.toISOString()),
                        '예약에 실패했습니다.',
                      );
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

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * 1.5 },
  strong: { color: colors.text, fontWeight: '800' },
  provider: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800' },
  accuracy: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs / 2,
  },
  rangeLabel: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },
  range: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  finalLabel: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },
  final: { color: colors.primary, fontSize: font.title, fontWeight: '800' },
  overrun: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  visitLabel: { color: colors.text, fontSize: font.body, fontWeight: '700', marginTop: spacing.sm },
  memo: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
});
