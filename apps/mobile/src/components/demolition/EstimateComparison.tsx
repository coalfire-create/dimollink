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
import { Card, ErrorBanner, IconTile, SectionTitle } from '../ui';
import { EstimateCardItem } from './EstimateCardItem';
import { theme } from '../../theme';

/**
 * 소비자용 철거 견적 비교 — 개산(범위) 확인 → 실사 예약 → 확정 견적 수락.
 *
 * 화면이 강조해야 할 것은 **개산은 아직 금액이 아니라는 사실**이다. 여기서 금액처럼
 * 보이면 사용자는 그 숫자로 결정하고, 확정에서 달라졌을 때 속았다고 느낀다.
 */
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
            const acc = await getEstimateAccuracy(e.providerId);
            return [e.providerId, acc] as const;
          } catch {
            return null;
          }
        }),
      );
      const accMap: Record<string, ProviderEstimateAccuracy> = {};
      for (const p of pairs) {
        if (p) accMap[p[0]] = p[1];
      }
      setAccuracy(accMap);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적 목록을 불러오지 못했습니다.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(id: string, action: () => Promise<unknown>, fallbackMsg: string) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackMsg);
    } finally {
      setBusyId(null);
    }
  }

  if (estimates.length === 0) {
    return (
      <>
        <SectionTitle>업체별 견적 비교</SectionTitle>
        <Card style={styles.emptyCard}>
          <IconTile icon="document" size="md" style={styles.emptyIcon} />
          <View style={styles.flex}>
            <Text style={styles.emptyTitle}>아직 들어온 견적이 없어요</Text>
            <Text style={styles.hint}>
              보통 반나절 안에 업체들이 현장 사진과 조건을 보고 예상 금액을 보내와요.
            </Text>
          </View>
        </Card>
      </>
    );
  }

  const visitsLeft = Math.max(0, MAX_SITE_VISITS_PER_REQUEST - countScheduledVisits(estimates));

  return (
    <>
      <SectionTitle>업체별 견적 비교 ({estimates.length}곳)</SectionTitle>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>개산(예상) 견적이란?</Text>
        <Text style={styles.noticeBody}>
          현장 실사 후 금액이 정해져요. 실사는 최대 {MAX_SITE_VISITS_PER_REQUEST}곳까지 부를 수
          있어요 · 남은 횟수 {visitsLeft}회
        </Text>
      </View>
      <ErrorBanner message={error} />
      {[...estimates]
        .sort((a, b) => a.preliminary.minAmount - b.preliminary.minAmount)
        .map((e, index) => (
          <EstimateCardItem
            key={e.id}
            estimate={e}
            index={index}
            accuracy={accuracy[e.providerId]}
            visitsLeft={visitsLeft}
            visitAt={visitAt[e.id]}
            busy={busyId === e.id}
            onSelectVisitAt={(iso) => setVisitAt((prev) => ({ ...prev, [e.id]: iso }))}
            onAcceptFinal={() =>
              void run(
                e.id,
                async () => {
                  await acceptDemolitionEstimate(e.id);
                  onMatched();
                },
                '수락에 실패했습니다.',
              )
            }
            onCancelVisit={() =>
              void run(e.id, () => cancelSiteVisit(e.id), '취소에 실패했습니다.')
            }
            onRequestVisit={() => {
              const iso = visitAt[e.id];
              if (!iso) {
                setError('실사 받을 날짜와 시간을 골라 주세요.');
                return;
              }
              void run(e.id, () => scheduleSiteVisit(e.id, iso), '예약에 실패했습니다.');
            }}
          />
        ))}
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
});
