import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { IconTile, ListGroup, ListRow } from '../../components/ui';
import { theme } from '../../theme';
import { VisionResultCard } from './VisionResultCard';
import type { RequestFormState } from './useRequestForm';

/**
 * 현장 사진 분석 패널 — 디몰비전 AI 소개 + 촬영 방법 세 가지 + 분석 결과.
 *
 * 예전에는 패널 안에 "주소 → 건물 정보 → 사진" 3단계 표시가 따로 있었는데, 신청 화면이 이미
 * 단계(4/4)로 나뉘어 같은 진행 표시가 두 번 보였다. 패널은 지금 상태 한 줄(건축물대장 확인
 * 여부)만 보이고, 촬영 방법은 같은 모양의 목록 세 줄로 정리했다(점선 버튼 + 밑줄 링크 두 개가
 * 섞여 있으면 무엇이 버튼인지 헷갈린다).
 */
export function VisionPanel({ form }: { form: RequestFormState }) {
  const {
    ledgerState,
    dimolVision,
    photoBusy,
    photoSummary,
    visionLocked,
    visionDisabled,
    guardVision,
    setGuidedOpen,
    setCameraOpen,
    fillFromPhoto,
  } = form;

  const status = photoBusy
    ? '사진을 분석하고 있어요…'
    : ledgerState === 'loading'
      ? '건축물대장을 확인하고 있어요…'
      : dimolVision
        ? '분석 완료 — 아래 결과를 확인해 주세요'
        : ledgerState === 'found'
          ? '건축물대장 확인 완료 · 사진만 올리면 돼요'
          : null;

  return (
    <View>
      <View style={styles.intro}>
        <IconTile icon="sparkles" tone="solid" style={styles.introIcon} />
        <View style={styles.introText}>
          <Text style={styles.introTitle}>디몰비전 AI 사진 분석</Text>
          <Text style={styles.introBody}>사진으로 폐기물 양과 위험 요소를 먼저 살펴봐요.</Text>
        </View>
      </View>
      {status ? (
        <View style={styles.status}>
          {photoBusy || ledgerState === 'loading' ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.statusDot} />
          )}
          <Text style={styles.statusText}>{status}</Text>
        </View>
      ) : null}

      {visionLocked ? (
        <View style={styles.lockNotice}>
          <Text style={styles.lockTitle}>먼저 현장 주소를 지정해 주세요</Text>
          <Text style={styles.lockBody}>
            주소로 건축물대장(용도·구조·층수)을 먼저 확인한 뒤 사진을 분석해요.
          </Text>
        </View>
      ) : null}

      <ListGroup>
        <ListRow
          icon="camera"
          title="가이드 촬영"
          badge="추천"
          subtitle="안내에 따라 현장 전체를 빠짐없이"
          disabled={visionDisabled}
          onPress={() => guardVision(() => setGuidedOpen(true))}
        />
        <ListRow
          icon="camera"
          title="자유 촬영"
          subtitle="필요한 곳만 바로 찍어요"
          disabled={visionDisabled}
          onPress={() => guardVision(() => setCameraOpen(true))}
        />
        <ListRow
          icon="image"
          title="앨범에서 선택"
          subtitle="이미 찍어 둔 사진을 올려요"
          disabled={visionDisabled}
          onPress={() => guardVision(fillFromPhoto)}
        />
      </ListGroup>

      {photoSummary ? <Text style={styles.summary}>{photoSummary}</Text> : null}
      {dimolVision ? <VisionResultCard vision={dimolVision} /> : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  intro: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  introIcon: {
    marginRight: spacing.sm,
  },
  introText: {
    flex: 1,
  },
  introTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  introBody: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    minHeight: theme.touch.minButtonHeight,
  },
  statusDot: {
    backgroundColor: theme.colors.success,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  statusText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '600',
  },
  lockNotice: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  lockTitle: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  lockBody: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
  summary: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginBottom: spacing.sm,
  },
});
