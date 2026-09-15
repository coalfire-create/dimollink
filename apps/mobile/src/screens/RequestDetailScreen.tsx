import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRequestCancellable, type ServiceRequest } from '@dimol/shared';
import { Card, ErrorBanner, SectionTitle } from '../components/ui';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { RequestDetailSkeleton } from '../components/Skeleton';
import { StatusTimeline } from '../components/StatusTimeline';
import { FadeInUp } from '../components/motion';
import { EstimateComparison } from '../components/demolition/EstimateComparison';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { CancelPanel } from './request-detail/CancelPanel';
import { CounterpartyActions } from './request-detail/CounterpartyActions';
import { PaidRefundCard } from './request-detail/PaidRefundCard';
import { ProviderWorkCard } from './request-detail/ProviderWorkCard';
import { QuoteList } from './request-detail/QuoteList';
import { RequestHeroCard } from './request-detail/RequestHeroCard';
import { RequestInfoCard } from './request-detail/RequestInfoCard';
import { useRequestDetail } from './request-detail/useRequestDetail';
import { theme } from '../theme';

/**
 * 요청 진행 상태 상세 — 지금 어느 단계인지, 지금 내가 할 수 있는 게 뭔지.
 *
 * 이 파일은 **누구에게 무엇을 보여줄지**만 정한다(배출자냐 업체냐, 어느 상태냐).
 * 데이터와 상태 전이는 [[useRequestDetail]] 에, 각 구간의 화면은
 * `screens/request-detail/` 아래 자기 파일에 있다.
 */

const KIND_LABELS: Record<ServiceRequest['kind'], string> = {
  DEMOLITION: '철거 요청',
  TRANSPORT: '운반 요청',
  DISPOSAL_RESERVATION: '처리장 예약',
};

export function RequestDetailScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const user = useSession();
  const detail = useRequestDetail(requestId);
  const { request } = detail;

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: '홈', onPress: () => nav.switchTab('home') },
        { label: '요청 관리', onPress: () => nav.switchTab('requests') },
        { label: '진행 상태 상세' },
      ]}
    />
  );

  // 아직 보여줄 데이터가 없는 동안에는 스피너 대신 들어올 화면의 뼈대를 그린다.
  // 데이터가 도착해도 레이아웃이 통째로 바뀌지 않아 화면이 튀지 않는다.
  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="요청 상세" canGoBack />
        {crumbs}
        <ErrorBanner message={detail.errorMessage} onRetry={() => void detail.refetch()} />
        {detail.isLoading ? <RequestDetailSkeleton /> : null}
      </View>
    );
  }

  const cancelled = request.status === 'CANCELLED';
  const isRequester = user.id === request.requesterId;
  const isProvider = user.id === request.matchedProviderId;
  const counterpartyId = request.matchedProviderId
    ? isRequester
      ? request.matchedProviderId
      : request.requesterId
    : null;
  const awaitingPayment =
    isRequester && request.status === 'MATCHED' && request.agreedFee !== undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KIND_LABELS[request.kind]} canGoBack />
      {crumbs}
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={0}>
          <RequestHeroCard
            request={request}
            kindLabel={KIND_LABELS[request.kind]}
            awaitingPayment={awaitingPayment}
          />
        </FadeInUp>

        {cancelled ? (
          <FadeInUp delay={40}>
            <Card>
              <Text style={styles.cancelledTitle}>취소된 요청이에요</Text>
              {request.cancelReason ? (
                <Text style={styles.cancelledReason}>사유: {request.cancelReason}</Text>
              ) : null}
            </Card>
          </FadeInUp>
        ) : (
          <FadeInUp delay={40}>
            <SectionTitle>진행 상황</SectionTitle>
            <Card>
              <StatusTimeline status={request.status} />
            </Card>
          </FadeInUp>
        )}

        <RequestInfoCard request={request} photoUrls={detail.photoUrls} />

        {/* 철거는 현장을 봐야 금액이 정해진다 — 개산/실사/확정을 나눠 보여준다.
            운반·처리의 단발 견적(아래 '받은 견적')과는 다른 흐름이다. */}
        {isRequester && request.kind === 'DEMOLITION' && request.status === 'REQUESTED' ? (
          <EstimateComparison requestId={request.id} onMatched={() => void detail.reload()} />
        ) : null}

        <QuoteList
          quotes={detail.quotes}
          acceptingQuoteId={detail.acceptingQuoteId}
          onAccept={detail.acceptQuoteAndMatch}
        />

        {isRequester && request.status === 'PAID' ? (
          <PaidRefundCard
            canRefund={!!request.paymentId}
            refunding={detail.refunding}
            onRefund={detail.confirmRefund}
          />
        ) : null}

        {isProvider ? (
          <ProviderWorkCard
            request={request}
            advancing={detail.advancing}
            onAdvance={detail.advance}
          />
        ) : null}

        <CounterpartyActions request={request} counterpartyId={counterpartyId} />

        <ErrorBanner message={detail.errorMessage} />

        {isRequestCancellable(request.status) ? (
          <CancelPanel cancelling={detail.cancelling} onCancel={detail.confirmCancel} />
        ) : null}
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
  cancelledTitle: {
    color: colors.error,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  cancelledReason: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
});
