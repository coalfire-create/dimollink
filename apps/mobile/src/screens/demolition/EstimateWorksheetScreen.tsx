import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  asbestosRisk,
  estimateChecklist,
  resolveFloorArea,
  type DemolitionEstimate,
  type ProviderEstimateAccuracy,
  type ServiceRequest,
} from '@dimol/shared';
import {
  ApiError,
  getEstimateAccuracy,
  getPricing,
  getRequest,
  listDemolitionEstimates,
  submitFinalEstimate,
  submitPreliminaryEstimate,
} from '../../api/client';
import { AppIcon } from '../../components/AppIcon';
import {
  Card,
  ErrorBanner,
  KeyboardAwareScreen,
  LoadingView,
  SectionTitle,
} from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { EstimateInputCard } from '../../components/demolition/EstimateInputCard';
import { SiteBriefCard } from '../../components/demolition/SiteBriefCard';
import { SitePhotoStrip } from '../../components/demolition/SitePhotoStrip';
import { WasteBreakdownCard } from '../../components/demolition/WasteBreakdownCard';
import { ScreenHeader, useNavigation, useSession } from '../../navigation';
import { theme } from '../../theme';

/**
 * 철거 견적 산정 화면.
 *
 * 예전에는 홈의 일감 카드 안에 입력칸 세 개만 박혀 있었다. 업체는 주소·톤수·날짜만
 * 보고 금액을 불러야 했는데, 정작 요청에는 현장 사진, 건축물대장(구조·지붕·사용승인일),
 * 진입 조건, 소재별 물량, AI 분석이 다 들어 있었다. 그걸 다 못 보고 낸 금액이라
 * 실사에서 뒤집히고, 그게 추가금 분쟁이 된다.
 *
 * 이 화면은 그 정보를 **금액을 흔드는 순서**로 펼쳐 놓고 마지막에 금액을 받는다.
 * 화면이 길어지므로 각 구획은 별도 컴포넌트다([[SiteBriefCard]] 등).
 */
export function EstimateWorksheetScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const user = useSession();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [mine, setMine] = useState<DemolitionEstimate | null>(null);
  const [accuracy, setAccuracy] = useState<ProviderEstimateAccuracy | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [req, rows] = await Promise.all([
        getRequest(requestId),
        // 밀봉이라 서버가 내 것만 돌려준다.
        listDemolitionEstimates(requestId),
      ]);
      setRequest(req);
      setMine(rows[0] ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }

    // 단가·정확도는 부가 정보 — 실패해도 견적은 낼 수 있어야 한다.
    void getPricing(user.id)
      .then((p) => setUnitPrice(p?.unitPrice ?? null))
      .catch(() => setUnitPrice(null));
    void getEstimateAccuracy(user.id)
      .then(setAccuracy)
      .catch(() => setAccuracy(null));
  }, [requestId, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="견적 산정" canGoBack />
        <LoadingView />
      </View>
    );
  }

  if (!request || request.kind !== 'DEMOLITION') {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="견적 산정" canGoBack />
        <View style={styles.errorFill}>
          <ErrorBanner
            message={error ?? '철거 요청을 찾을 수 없습니다.'}
            onRetry={() => void load()}
          />
        </View>
      </View>
    );
  }

  const details = request.demolitionDetails;
  const area = resolveFloorArea(details);
  const risk = asbestosRisk(details?.buildingLedger);
  const checklist = estimateChecklist(details, {
    asbestosHigh: risk === 'HIGH' || risk === 'POSSIBLE',
    photoCount: request.sitePhotoKeys.length,
    area,
  });

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScreenHeader title="견적 산정" canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FadeInUp delay={20}>
          <SiteBriefCard
            details={details}
            area={area}
            siteAddress={request.siteAddress}
            distanceKm={'distanceKm' in request ? (request.distanceKm as number | null) : null}
          />
        </FadeInUp>

        <FadeInUp delay={60}>
          <SitePhotoStrip photoKeys={request.sitePhotoKeys} />
        </FadeInUp>

        <FadeInUp delay={100}>
          <WasteBreakdownCard
            wasteItems={request.wasteItems}
            wasteTons={request.wasteTons}
            vision={details?.dimolVisionAnalysis}
          />
        </FadeInUp>

        {checklist.caution.length > 0 || checklist.missing.length > 0 ? (
          <FadeInUp delay={140}>
            <SectionTitle>산정 전 확인</SectionTitle>
            <Card>
              {checklist.caution.map((line) => (
                <View key={line} style={styles.checkRow}>
                  <AppIcon name="alert" size={20} color={colors.warning} />
                  <Text style={styles.cautionText}>{line}</Text>
                </View>
              ))}
              {checklist.missing.map((line) => (
                <View key={line} style={styles.checkRow}>
                  <AppIcon name="document" size={20} color={colors.textMuted} />
                  <Text style={styles.missingText}>{line}</Text>
                </View>
              ))}
            </Card>
          </FadeInUp>
        ) : null}

        {/* 내 개산이 확정에서 얼마나 틀리는지 — 범위를 얼마나 넓게 잡을지 판단 근거. */}
        {accuracy && accuracy.sampleCount > 0 ? (
          <FadeInUp delay={160}>
            <Card style={styles.accuracyCard}>
              <Text style={styles.accuracyLabel}>내 개산 정확도</Text>
              {accuracy.sampleCount < 3 ? (
                <Text style={styles.accuracyValue}>
                  실적 {accuracy.sampleCount}건 — 아직 판단하기 이릅니다
                </Text>
              ) : (
                <Text style={styles.accuracyValue}>
                  개산 대비 확정 평균{' '}
                  {(accuracy.averageDeviation ?? 0) > 0 ? '+' : ''}
                  {Math.round((accuracy.averageDeviation ?? 0) * 100)}% · {accuracy.sampleCount}건
                </Text>
              )}
              <Text style={styles.accuracyHint}>
                소비자에게도 보이는 지표입니다. 확정에서 많이 올릴수록 다음 매칭이 어려워집니다.
              </Text>
            </Card>
          </FadeInUp>
        ) : null}

        <FadeInUp delay={200}>
          <EstimateInputCard
            mine={mine}
            area={area}
            wasteTons={request.wasteTons}
            myUnitPrice={unitPrice}
            busy={busy}
            error={error}
            onSubmitPreliminary={(input) =>
              void run(
                () => submitPreliminaryEstimate({ requestId, ...input }),
                '개산 견적 제출에 실패했습니다.',
              )
            }
            onSubmitFinal={(input) => {
              if (!mine) return;
              void run(
                () => submitFinalEstimate({ estimateId: mine.id, ...input }),
                '확정 견적 제출에 실패했습니다.',
              );
            }}
          />
        </FadeInUp>

        <FadeInUp delay={240}>
          <Card
            style={styles.linkCard}
            onPress={() => nav.push({ name: 'requestDetail', requestId })}
          >
            <Text style={styles.linkText}>요청 상세 전체 보기</Text>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </FadeInUp>
      </ScrollView>
    </KeyboardAwareScreen>
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
  errorFill: {
    padding: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  cautionText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    lineHeight: 28,
  },
  missingText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: font.body,
    lineHeight: 28,
  },
  accuracyCard: {
    backgroundColor: colors.surface,
  },
  accuracyLabel: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  accuracyValue: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  accuracyHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  linkCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  chevron: {
    color: colors.primary,
    fontSize: font.title,
    fontWeight: '800',
  },
});
