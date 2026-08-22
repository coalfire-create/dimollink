import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  MATERIAL_CATEGORY_LABELS,
  type DetectedMaterial,
  type SiteAnalysis,
} from '@dimol/shared';
import { ApiError, analyzeSite } from '../api/client';
import { AppButton, Card, ErrorBanner, ImagePlaceholder, StickyFooter } from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { ScreenHeader } from '../navigation';
import { theme } from '../theme';

/**
 * 현장 사진 AI 분석 (Phase 6) — 사진 촬영/선택 → 소재 식별 + 철거 공정 안내 + 위험 경고.
 * 키 미설정 시 서버가 목으로 응답한다. 결과는 항상 참고용(안전 고지 포함).
 */

const CONFIDENCE_LABELS: Record<string, string> = { LOW: '참고', MEDIUM: '보통', HIGH: '높음' };

interface PickedImage {
  base64: string;
  mimeType: string;
  uri: string;
}

function mimeFromUri(uri: string): string {
  return uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export function SiteAnalysisScreen() {
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function applyAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!asset.base64) {
      setError('사진을 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    setResult(null);
    setError(null);
    setImage({ base64: asset.base64, mimeType: asset.mimeType ?? mimeFromUri(asset.uri), uri: asset.uri });
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets[0]) applyAsset(res.assets[0]);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('카메라 권한이 필요해요. 설정에서 허용해 주세요.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 });
    if (!res.canceled && res.assets[0]) applyAsset(res.assets[0]);
  }

  async function analyze() {
    if (!image) return;
    setError(null);
    setLoading(true);
    try {
      setResult(await analyzeSite({ imageBase64: image.base64, mimeType: image.mimeType }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '분석에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  const SAMPLE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  function loadSampleAndAnalyze() {
    setImage({
      base64: SAMPLE_BASE64,
      mimeType: 'image/png',
      uri: 'data:image/png;base64,' + SAMPLE_BASE64,
    });
    setResult(null);
    setError(null);
    setLoading(true);
    analyzeSite({ imageBase64: SAMPLE_BASE64, mimeType: 'image/png' })
      .then((res) => setResult(res))
      .catch((err) => setError(err instanceof ApiError ? err.message : '분석에 실패했어요.'))
      .finally(() => setLoading(false));
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="현장 AI 분석 (소재·공정)" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroCardBadge}>✨ Vision AI 엔진</Text>
          <Text style={styles.heroCardTitle}>현장 사진 한 장으로{'\n'}소재와 철거 공정을 분석해 드려요</Text>
          <Text style={styles.heroCardDesc}>위험물(석면) 식별 · 공정 단계별 주의사항 · 재활용 분류</Text>
        </View>

        {image ? (
          <FadeInUp>
            <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
          </FadeInUp>
        ) : (
          // 빈 이미지 자리 — 회색 빈칸 대신 디몰링크 로고 placeholder 를 기본으로 노출한다.
          <ImagePlaceholder label="철거 현장 사진을 업로드해 주세요">
            <PressableScale style={styles.sampleQuickBtn} onPress={loadSampleAndAnalyze}>
              <Text style={styles.sampleQuickBtnText}>⚡️ 샘플 사진으로 AI 즉시 분석 시연</Text>
            </PressableScale>
          </ImagePlaceholder>
        )}

        <View style={styles.pickRow}>
          <PressableScale style={styles.pickBtn} onPress={takePhoto} accessibilityRole="button">
            <Text style={styles.pickBtnText}>📸 촬영</Text>
          </PressableScale>
          <View style={{ width: theme.spacing.sm }} />
          <PressableScale style={styles.pickBtn} onPress={pickFromLibrary} accessibilityRole="button">
            <Text style={styles.pickBtnText}>🖼️ 앨범</Text>
          </PressableScale>
        </View>

        <ErrorBanner message={error} />

        {result ? <AnalysisResult result={result} /> : null}
      </ScrollView>

      {image && !result ? (
        <StickyFooter>
          <AppButton label="이 사진 분석하기" onPress={analyze} loading={loading} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

function MaterialRow({ m }: { m: DetectedMaterial }) {
  return (
    <View style={[styles.materialRow, m.hazardous && styles.materialRowHazard]}>
      <View style={styles.materialTop}>
        <Text style={styles.materialName}>
          {m.hazardous ? '⚠️ ' : ''}
          {m.name}
        </Text>
        <View style={[styles.tag, m.hazardous ? styles.tagHazard : styles.tagOk]}>
          <Text style={[styles.tagText, m.hazardous ? styles.tagTextHazard : styles.tagTextOk]}>
            {m.hazardous ? '위험' : m.recyclable ? '재활용' : '일반'}
          </Text>
        </View>
      </View>
      <Text style={styles.materialMeta}>
        {MATERIAL_CATEGORY_LABELS[m.category]} · 신뢰도 {CONFIDENCE_LABELS[m.confidence] ?? m.confidence}
        {m.note ? ` · ${m.note}` : ''}
      </Text>
    </View>
  );
}

function AnalysisResult({ result }: { result: SiteAnalysis }) {
  return (
    <View>
      <FadeInUp delay={40}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.summaryLabel}>현장 분석</Text>
            <View style={styles.methodChip}>
              <Text style={styles.methodChipText}>
                {result.method === 'AI_VISION' ? 'AI 분석' : '샘플'} · 신뢰도{' '}
                {CONFIDENCE_LABELS[result.confidence] ?? result.confidence}
              </Text>
            </View>
          </View>
          <Text style={styles.summaryText}>{result.summary}</Text>
        </View>
      </FadeInUp>

      <Text style={styles.section}>구성 소재 ({result.materials.length})</Text>
      <FadeInUp delay={100}>
        <Card>
          {result.materials.map((m, i) => (
            <View key={`${m.name}-${i}`}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <MaterialRow m={m} />
            </View>
          ))}
        </Card>
      </FadeInUp>

      <Text style={styles.section}>철거 공정</Text>
      {result.demolitionSteps.map((s, i) => (
        <FadeInUp key={s.order} delay={140 + i * 60}>
          <Card>
            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{s.order}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDesc}>{s.description}</Text>
                {s.caution ? <Text style={styles.stepCaution}>⚠ {s.caution}</Text> : null}
              </View>
            </View>
          </Card>
        </FadeInUp>
      ))}

      {result.hazards.length > 0 ? (
        <FadeInUp>
          <View style={styles.hazardCard}>
            <Text style={styles.hazardTitle}>⚠️ 위험 요소</Text>
            {result.hazards.map((h, i) => (
              <Text key={i} style={styles.hazardItem}>
                • {h}
              </Text>
            ))}
          </View>
        </FadeInUp>
      ) : null}

      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  heroCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroCardBadge: {
    backgroundColor: '#7C3AED',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  heroCardTitle: {
    color: '#FFFFFF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
    lineHeight: font.bodyLarge + 6,
  },
  heroCardDesc: {
    color: '#C7D2FE',
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  intro: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.md },
  preview: { borderRadius: radius.card, height: 220, width: '100%' },
  sampleQuickBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  sampleQuickBtnText: {
    color: '#FFFFFF',
    fontSize: font.caption,
    fontWeight: '800',
  },
  pickRow: { flexDirection: 'row', marginTop: spacing.sm },
  pickBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.touch.primaryButtonHeight,
  },
  pickBtnText: { color: colors.primary, fontSize: font.bodyLarge, fontWeight: '700' },
  summaryCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  summaryTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: colors.primary, fontSize: font.body, fontWeight: '700' },
  methodChip: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
  methodChipText: { color: colors.primary, fontSize: font.caption, fontWeight: '700' },
  summaryText: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '600', marginTop: spacing.sm },
  section: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '800', marginBottom: spacing.sm, marginTop: spacing.md },
  materialRow: { paddingVertical: spacing.xs },
  materialRowHazard: {},
  materialTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  materialName: { color: colors.text, flex: 1, fontSize: font.bodyLarge, fontWeight: '700' },
  materialMeta: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  tag: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs / 2 },
  tagOk: { backgroundColor: colors.primarySoft },
  tagHazard: { backgroundColor: '#FBEAEA' },
  tagText: { fontSize: font.caption, fontWeight: '700' },
  tagTextOk: { color: colors.primary },
  tagTextHazard: { color: colors.error },
  divider: { backgroundColor: colors.border, height: 1, marginVertical: spacing.xs },
  stepRow: { flexDirection: 'row' },
  stepNum: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 32,
  },
  stepNumText: { color: colors.background, fontSize: font.body, fontWeight: '800' },
  stepTitle: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  stepDesc: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs / 2 },
  stepCaution: { color: colors.error, fontSize: font.body, marginTop: spacing.xs },
  hazardCard: {
    backgroundColor: '#FBEAEA',
    borderRadius: radius.card,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  hazardTitle: { color: colors.error, fontSize: font.bodyLarge, fontWeight: '800', marginBottom: spacing.xs },
  hazardItem: { color: colors.error, fontSize: font.body, marginTop: spacing.xs / 2 },
  disclaimer: { color: colors.textMuted, fontSize: font.caption, marginTop: spacing.md },
});
