import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type RankedJob,
  type ServiceRequest,
} from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { Card, InlineEmpty, SectionTitle, StatusBadge } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';
import { requestSubtitle, requestTons } from '../../lib/request-summary';

/**
 * 업체 홈의 일감 카드 — 아직 안 잡힌 일감(open)과 이미 수주한 일감(assigned).
 *
 * 운반·처리장 홈이 똑같은 카드를 각자 그리고 있었다. 다른 건 카드 안에 들어가는
 * **동작**뿐이라(금액 입력+수락 / 견적 제출) 그 자리만 children 으로 비웠다.
 * (철거 홈은 카드 자체가 다르다 — 연면적·석면까지 얹은 별도 카드를 쓴다.)
 *
 * 거리(km)를 제목 옆에 붙이는 이유: 업체가 수락 여부를 판단할 때 가장 먼저 보는 값이다.
 */
export function OpenJobCard({ job, children }: { job: RankedJob; children: React.ReactNode }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.title}>{REQUEST_KIND_LABELS[job.kind]}</Text>
        {job.distanceKm != null ? (
          <View style={styles.distanceRow}>
            <AppIcon name="location" size={18} color={theme.colors.primary} />
            <Text style={styles.distance}>{job.distanceKm}km</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.meta}>{requestSubtitle(job)}</Text>
      <Text style={styles.meta}>
        {new Date(job.createdAt).toLocaleDateString('ko-KR')}
        {requestTons(job) ? ` · ${requestTons(job)}` : ''}
      </Text>
      <View style={styles.gap} />
      {children}
    </Card>
  );
}

/**
 * 수주한 일감 목록 — 상태 배지와 함께, 누르면 상세로 간다.
 * 비어 있을 때 빈칸 대신 문장을 남긴다(무엇이 없는지 알아야 다음 행동이 나온다).
 */
export function AssignedJobList({
  title,
  jobs,
  emptyText,
}: {
  title: string;
  jobs: ServiceRequest[];
  emptyText: string;
}) {
  const nav = useNavigation();
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      {jobs.length > 0 ? (
        jobs.map((job) => (
          <Card key={job.id} onPress={() => nav.push({ name: 'requestDetail', requestId: job.id })}>
            <View style={styles.row}>
              <Text style={styles.title}>{REQUEST_KIND_LABELS[job.kind]}</Text>
              <StatusBadge status={job.status} label={REQUEST_STATUS_LABELS[job.status]} />
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {requestSubtitle(job)}
              {requestTons(job) ? ` · ${requestTons(job)}` : ''}
            </Text>
          </Card>
        ))
      ) : (
        <InlineEmpty>{emptyText}</InlineEmpty>
      )}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  distanceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs / 2,
  },
  gap: {
    height: theme.spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  distance: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
});
