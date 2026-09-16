import React from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { StatusTimeline } from '../../components/StatusTimeline';
import { Card, SectionTitle, StatusBadge } from '../../components/ui';
import { AppButton } from '../../components/ui/AppButton';
import { requestSubtitle, requestTons } from '../../lib/request-summary';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * 진행 중인 내 요청 대시보드 — 홈 화면을 가득 채우는 형태로 철거 진행 상태를 보여준다.
 * 여러 건일 경우 가로 스와이프(캐러셀)로 넘겨볼 수 있다.
 */
export function ActiveRequestDashboard({ requests }: { requests: ServiceRequest[] }) {
  const nav = useNavigation();
  if (requests.length === 0) return null;

  return (
    <View style={styles.container}>
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
        snapToInterval={SCREEN_WIDTH}
        decelerationRate="fast"
      >
        {requests.map((request) => (
          <View key={request.id} style={styles.page}>
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
                variant="secondary"
                onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
              />
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
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
    fontSize: font.caption,
    fontWeight: '600',
  },
  scrollContent: {
  },
  page: {
    width: SCREEN_WIDTH,
    paddingHorizontal: spacing.sm,
  },
  card: {
    flex: 1,
    minHeight: 460, 
    justifyContent: 'space-between',
  },
  cardHeader: {
    marginBottom: spacing.md,
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
    flex: 1,
    paddingVertical: spacing.sm,
  },
});
