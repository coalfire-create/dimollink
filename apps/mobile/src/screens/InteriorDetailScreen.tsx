import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { INTERIOR_CATEGORY_LABELS, REQUEST_STATUS_LABELS } from '@dimol/shared';
import {
  Card,
  ErrorBanner,
  InfoRow,
  LoadingView,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import { won } from '../lib/format';
import { ScreenHeader } from '../navigation';
import { BidComparison, MatchResult, MyBidPanel } from './interior/BidPanels';
import { useInteriorDetail } from './interior/useInteriorDetail';
import { theme } from '../theme';

/**
 * 인테리어 요청 상세 (파일럿 밖 · FEATURE_INTERIOR).
 *
 * 이 파일은 누구에게 어떤 패널을 보여줄지만 정한다 — 밀봉 규칙과 데이터는
 * [[useInteriorDetail]] 에, 각 패널은 `screens/interior/` 에 있다.
 */
export function InteriorDetailScreen({ requestId }: { requestId: string }) {
  const detail = useInteriorDetail(requestId);
  const { request } = detail;

  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="시공 요청" canGoBack />
        <ErrorBanner message={detail.error} />
        {detail.error ? null : <LoadingView />}
      </View>
    );
  }

  const { isRequester, isOpen } = detail;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="시공 요청" canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusHeader}>
          <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
        </View>

        <Text style={styles.title}>{request.title}</Text>

        <SectionTitle>요청 정보</SectionTitle>
        <Card>
          <InfoRow label="공사 종류" value={INTERIOR_CATEGORY_LABELS[request.category]} />
          <InfoRow label="지역" value={request.region} />
          <InfoRow label="현장 주소" value={request.siteAddress} />
          {request.budget ? <InfoRow label="희망 예산" value={won(request.budget)} /> : null}
          {request.description ? <InfoRow label="요구사항" value={request.description} /> : null}
          <InfoRow label="접수일" value={new Date(request.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        {isRequester && isOpen ? <BidComparison detail={detail} /> : null}
        {isRequester && !isOpen && request.status !== 'CANCELLED' ? (
          <MatchResult request={request} />
        ) : null}
        {!isRequester ? <MyBidPanel detail={detail} /> : null}

        <ErrorBanner message={detail.error} />
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  statusHeader: {
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
});
