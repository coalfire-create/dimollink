import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { REQUEST_KIND_LABELS, REQUEST_STATUS_LABELS, type ServiceRequest } from '@dimol/shared';
import { Card, SectionTitle, StatusBadge } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 홈의 "진행 중인 내 요청" — 끝나지 않은 건만 추려 보여준다.
 *
 * 전체 목록은 이용내역 탭에 있다. 홈에서는 지금 신경 써야 하는 것만 보여야 해서
 * 완료·정산된 건은 뺀다(취소된 건도 더 할 일이 없으므로 여기 두지 않는다).
 */
export function ActiveRequestList({ requests }: { requests: ServiceRequest[] }) {
  const nav = useNavigation();
  if (requests.length === 0) return null;

  return (
    <>
      <SectionTitle>진행 중인 내 요청</SectionTitle>
      {requests.map((request) => (
        <Card
          key={request.id}
          onPress={() => nav.push({ name: 'requestDetail', requestId: request.id })}
        >
          <View style={styles.row}>
            <Text style={styles.title}>{REQUEST_KIND_LABELS[request.kind]}</Text>
            <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
          </View>
          <Text style={styles.meta}>
            {request.wasteTons}톤 · {new Date(request.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        </Card>
      ))}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  meta: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
