import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { asbestosRisk, estimateChecklist, resolveFloorArea } from '@dimol/shared';
import { Card, ErrorBanner, KeyboardAwareScreen, LoadingView } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { EstimateInputCard } from '../../components/demolition/EstimateInputCard';
import { SiteBriefCard } from '../../components/demolition/SiteBriefCard';
import { SitePhotoStrip } from '../../components/demolition/SitePhotoStrip';
import { WasteBreakdownCard } from '../../components/demolition/WasteBreakdownCard';
import { ScreenHeader, useNavigation } from '../../navigation';
import { AccuracyCard } from './AccuracyCard';
import { EstimateChecklistCard } from './EstimateChecklistCard';
import { useEstimateWorksheet } from './useEstimateWorksheet';
import { theme } from '../../theme';

/**
 * 견적 산정 화면 — 금액을 흔드는 순서로 펼친다.
 *
 * 석면·연면적 → 현장 조건 → 사진 → 물량 → 확인 항목 → 내 정확도 → 금액 입력.
 * 업체가 "못 보고 부른 금액"이 실사에서 뒤집히지 않게, 판단에 필요한 것을 금액 입력칸
 * **앞에** 전부 늘어놓는 게 이 화면의 목적이다.
 *
 * 데이터는 [[useEstimateWorksheet]] 에, 각 블록은 자기 파일에 있다.
 */
export function EstimateWorksheetScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const worksheet = useEstimateWorksheet(requestId);
  const { request } = worksheet;

  if (worksheet.loading) {
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
            message={worksheet.error ?? '철거 요청을 찾을 수 없습니다.'}
            onRetry={() => void worksheet.load()}
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

        {/* 가상 현장 — 원격 실사 사진·3D·영상통화로 현장에 가지 않고 실사를 마치는 곳. */}
        <FadeInUp delay={40}>
          <Card
            style={styles.linkCard}
            onPress={() => nav.push({ name: 'virtualSite', requestId })}
          >
            <View style={styles.linkBody}>
              <Text style={styles.linkText}>가상 현장 열기</Text>
              <Text style={styles.linkHint}>원격 실사 사진·3D·영상통화로 실사하기</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
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

        <FadeInUp delay={140}>
          <EstimateChecklistCard checklist={checklist} />
        </FadeInUp>

        <FadeInUp delay={160}>
          <AccuracyCard accuracy={worksheet.accuracy} />
        </FadeInUp>

        <FadeInUp delay={200}>
          <EstimateInputCard
            mine={worksheet.mine}
            area={area}
            wasteTons={request.wasteTons}
            myUnitPrice={worksheet.unitPrice}
            busy={worksheet.busy}
            error={worksheet.error}
            onSubmitPreliminary={worksheet.submitPreliminary}
            onSubmitFinal={worksheet.submitFinal}
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
  linkCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkBody: {
    flex: 1,
  },
  linkHint: {
    color: colors.textMuted,
    fontSize: font.body,
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
