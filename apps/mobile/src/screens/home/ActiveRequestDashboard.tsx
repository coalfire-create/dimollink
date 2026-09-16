import React, { useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { StatusTimeline } from '../../components/StatusTimeline';
import { Card, SectionTitle, StatusBadge } from '../../components/ui';
import { AppButton } from '../../components/ui/AppButton';
import { requestSubtitle, requestTons } from '../../lib/request-summary';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 진행 중인 내 요청 대시보드 — 홈 화면을 가득 채우는 형태로 철거 진행 상태를 보여준다.
 * 여러 건일 경우 가로 스와이프(캐러셀)로 넘겨볼 수 있다.
 */
export function ActiveRequestDashboard({ requests }: { requests: ServiceRequest[] }) {
  const nav = useNavigation();
  const initialWidth = Math.min(Dimensions.get('window').width, theme.maxContentWidth);
  const [pageWidth, setPageWidth] = useState<number>(initialWidth);
  const [activeIndex, setActiveIndex] = useState(0);

  if (requests.length === 0) return null;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - pageWidth) > 1) {
          setPageWidth(w);
        }
      }}
    >
      {requests.length > 1 ? (
        <View style={styles.header}>
          <SectionTitle>진행 중인 요청 ({requests.length}건)</SectionTitle>
          <Text style={styles.swipeHint}>옆으로 넘겨보세요</Text>
        </View>
      ) : (
        <View style={styles.header}>
          <SectionTitle>진행 중인 요청</SectionTitle>
        </View>
      )}

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={pageWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => {
          const nextIndex = Math.round(e.nativeEvent.contentOffset.x / (pageWidth || 1));
          setActiveIndex(nextIndex);
        }}
      >
        {requests.map((request) => (
          <View key={request.id} style={[styles.page, { width: pageWidth }]}>
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{REQUEST_KIND_LABELS[request.kind]}</Text>
                  <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {requestSubtitle(request)}
                </Text>
                <Text style={styles.meta}>
                  {new Date(request.createdAt).toLocaleDateString('ko-KR')}
                  {requestTons(request) ? ` · ${requestTons(request)}` : ''}
                </Text>
              </View>

              <View style={styles.timelineWrap}>
                <StatusTimeline status={request.status} />
              </View>

              <AppButton
                label="요청 상세 보기"
                variant="outline"
                style={styles.detailButton}
                onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
              />
            </Card>
          </View>
        ))}
      </ScrollView>

      {requests.length > 1 ? (
        <View style={styles.dotsRow}>
          {requests.map((r, i) => (
            <View
              key={r.id}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  swipeHint: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  scrollContent: {},
  page: {
    paddingHorizontal: spacing.sm,
  },
  card: {
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  cardHeader: {
    marginBottom: spacing.sm,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  timelineWrap: {
    paddingVertical: spacing.xs,
  },
  detailButton: {
    marginTop: spacing.sm,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  dot: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
});
