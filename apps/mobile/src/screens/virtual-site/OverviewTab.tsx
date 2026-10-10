import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildSiteRiskFlags, resolveFloorArea } from '@dimol/shared';
import { SiteBriefCard } from '../../components/demolition/SiteBriefCard';
import { Card, ErrorBanner, LoadingView, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';
import { RiskFlagsCard } from './RiskFlagsCard';
import { SurveySummaryCard } from './SurveySummaryCard';
import { useReviewSource } from './useReviewSource';

/**
 * 개요 탭 — 현장에 도착해서 처음 1분 동안 보는 것.
 * 위험 신호 → 원격 실사 자료(완료율·질문 답) → 현장 브리핑(신청 내용·건축물대장).
 */
export function OverviewTab({ requestId }: { requestId: string }) {
  const { request, survey, loading, error, reload } = useReviewSource(requestId);

  if (loading) return <LoadingView />;
  if (!request) return <ErrorBanner message={error} onRetry={() => void reload()} />;

  const details = request.demolitionDetails;
  const flags = buildSiteRiskFlags(survey, details?.buildingLedger);

  return (
    <View>
      <RiskFlagsCard flags={flags} />
      {survey ? (
        <SurveySummaryCard survey={survey} />
      ) : (
        <View>
          <SectionTitle>원격 실사 자료</SectionTitle>
          <Card>
            <Text style={styles.hint}>
              신청자가 아직 원격 실사 사진을 보내지 않았어요. 보내면 알림이 가고, 사진 탭에서 바로
              볼 수 있어요. 그 전에는 영상통화 탭에서 통화를 요청할 수 있어요.
            </Text>
          </Card>
        </View>
      )}
      <SiteBriefCard
        details={details}
        area={resolveFloorArea(details)}
        siteAddress={request.siteAddress}
      />
    </View>
  );
}

const { colors, font } = theme;

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28 },
});
