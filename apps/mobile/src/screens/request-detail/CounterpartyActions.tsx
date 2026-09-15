import React from 'react';
import { StyleSheet } from 'react-native';
import type { ServiceRequest } from '@dimol/shared';
import { AppButton, SectionTitle } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 상대방과 이어지는 동작 — 채팅 · 실시간 위치 · 리뷰.
 *
 * 매칭 전에는 상대가 없으니 아무것도 뜨지 않고, 취소된 건에서도 대화 입구는 숨긴다
 * (끝난 거래에 말을 걸 자리를 남겨 두면 거기서 분쟁이 이어진다).
 */
export function CounterpartyActions({
  request,
  counterpartyId,
}: {
  request: ServiceRequest;
  counterpartyId: string | null;
}) {
  const nav = useNavigation();
  if (!counterpartyId) return null;

  const cancelled = request.status === 'CANCELLED';
  const finished = request.status === 'COMPLETED' || request.status === 'SETTLED';
  const inTransit =
    request.kind === 'TRANSPORT' && (request.status === 'PAID' || request.status === 'IN_PROGRESS');

  return (
    <>
      {!cancelled ? (
        <>
          <SectionTitle>매칭 업체와 대화</SectionTitle>
          <AppButton
            label="채팅하기"
            variant="outline"
            onPress={() => nav.push({ name: 'chat', requestId: request.id, counterpartyId })}
          />
          {inTransit ? (
            <AppButton
              label="실시간 트럭 위치 확인"
              style={styles.spaced}
              onPress={() => nav.push({ name: 'tracking', requestId: request.id })}
            />
          ) : null}
        </>
      ) : null}

      {finished ? (
        <>
          <SectionTitle>서비스 평가</SectionTitle>
          <AppButton
            label="리뷰 남기기"
            variant="outline"
            onPress={() => nav.push({ name: 'reviewForm', requestId: request.id })}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: theme.spacing.sm,
  },
});
