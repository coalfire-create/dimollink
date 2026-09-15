import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AddressPickerField } from '../components/AddressPickerField';
import { AppButton, ErrorBanner, StickyFooter } from '../components/ui';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { Scan3DCaptureModal } from '../components/Scan3DCaptureModal';
import { Scan3DProgressCard } from '../components/Scan3DProgressCard';
import { Scan3DViewerModal } from '../components/Scan3DViewerModal';
import { ReferenceObjectPicker } from '../components/ReferenceObjectPicker';
import { FadeInUp } from '../components/motion';
import { ScreenHeader } from '../navigation';
import { AnalysisIntroCard } from './site-analysis/AnalysisIntroCard';
import { AnalysisReport } from './site-analysis/AnalysisReport';
import { LedgerPanel } from './site-analysis/LedgerPanel';
import {
  PhotoSourceButtons,
  PhotoSourcePanel,
  Scan3DEntryCard,
} from './site-analysis/PhotoSourcePanel';
import { useSiteAnalysis } from './site-analysis/useSiteAnalysis';
import { theme } from '../theme';

/**
 * 현장 진단 — 사진과 건축 정보로 소재·공정·위험 요소를 미리 확인한다.
 *
 * 이 파일은 순서만 정한다: 안내 → 사진 → 주소(선행 조건) → 촬영 입구 → 결과.
 * 상태와 분석 호출은 [[useSiteAnalysis]] 에, 각 블록은 `screens/site-analysis/` 에 있다.
 */
export function SiteAnalysisScreen() {
  const analysis = useSiteAnalysis();
  const { scan } = analysis;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="현장 AI 분석 (소재·공정)" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={40}>
          <AnalysisIntroCard
            badge="스마트 현장 분석"
            engineTag="자동화 리포트"
            title={`현장 사진 한 장으로\n소재와 철거 공정을 확인하세요`}
          />
        </FadeInUp>

        <FadeInUp delay={80}>
          <PhotoSourcePanel
            previewUri={analysis.image?.uri}
            locked={analysis.captureLocked}
            onClearPhoto={analysis.clearImage}
            onTrySample={() => analysis.guardCapture(analysis.analyzeSample)}
          />
        </FadeInUp>

        {/* 1단계 — 현장 주소 지정(분석의 선행 조건) */}
        <FadeInUp delay={100}>
          <View style={styles.addressBlock}>
            <AddressPickerField
              label="현장 주소"
              value={analysis.siteAddress}
              onChangeAddress={analysis.pickAddress}
              placeholder="예) ○○시 ○○구 ○○동 12-3"
              hint="주소를 먼저 지정하면 건축물대장 정보를 확인한 뒤 사진을 분석해요."
            />
            <LedgerPanel state={analysis.ledger.state} info={analysis.ledger.building} />
            {!analysis.addressReady ? (
              <View style={styles.lockNotice}>
                <Text style={styles.lockTitle}>먼저 현장 주소를 지정해 주세요</Text>
                <Text style={styles.lockBody}>
                  건축물대장(공공데이터)에서 그 건물의 용도·구조·층수·사용승인일을 먼저 확인한 뒤,
                  그 정보를 기준으로 사진을 분석해요.
                </Text>
              </View>
            ) : null}
          </View>
        </FadeInUp>

        <FadeInUp delay={120}>
          <PhotoSourceButtons
            locked={analysis.captureLocked}
            onTakePhoto={() => analysis.guardCapture(() => analysis.setCameraOpen(true))}
            onPickFromLibrary={() => analysis.guardCapture(analysis.pickFromLibrary)}
          />
        </FadeInUp>

        <FadeInUp delay={80}>
          <Scan3DEntryCard
            locked={analysis.captureLocked}
            onStartScan={() => analysis.guardCapture(() => analysis.setScanOpen(true))}
          />
        </FadeInUp>

        {scan.error ? <ErrorBanner message={scan.error} /> : null}
        {scan.job ? <Scan3DProgressCard job={scan.job} /> : null}
        {scan.sceneUrl ? (
          <AppButton label="3D로 보기" onPress={() => analysis.setViewerOpen(true)} />
        ) : null}

        <ErrorBanner message={analysis.error} />

        {analysis.result ? <AnalysisReport result={analysis.result} /> : null}
      </ScrollView>

      {analysis.image && !analysis.result ? (
        <StickyFooter>
          <AppButton
            label="이 사진 분석하기"
            onPress={analysis.analyze}
            loading={analysis.loading}
          />
        </StickyFooter>
      ) : null}

      <CameraCaptureModal
        visible={analysis.cameraOpen}
        onClose={() => analysis.setCameraOpen(false)}
        onCapture={analysis.handleCameraCapture}
      />
      <Scan3DCaptureModal
        visible={analysis.scanOpen}
        target="EXTERIOR"
        onClose={() => analysis.setScanOpen(false)}
        onComplete={analysis.handleScanCaptured}
      />
      <Scan3DViewerModal
        visible={analysis.viewerOpen}
        sceneUrl={scan.sceneUrl}
        onClose={() => analysis.setViewerOpen(false)}
        onMeasured={(units) => {
          // 잰 직후 뷰어를 닫고 "그게 뭐였는지" 묻는다 — 실제 길이를 알아야 배율이 나온다.
          analysis.setViewerOpen(false);
          analysis.setMeasuredUnits(units);
        }}
      />
      <ReferenceObjectPicker
        visible={analysis.measuredUnits !== null}
        onClose={() => analysis.setMeasuredUnits(null)}
        onSelect={(object) => {
          const units = analysis.measuredUnits;
          analysis.setMeasuredUnits(null);
          if (units) void scan.rescale(object.lengthM, units);
        }}
      />
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  addressBlock: {
    marginBottom: spacing.md,
  },
  lockNotice: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  lockTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  lockBody: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 24,
    marginTop: spacing.xs,
  },
});
