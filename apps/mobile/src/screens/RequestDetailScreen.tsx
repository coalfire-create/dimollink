import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isRequestCancellable, type ServiceRequest } from '@dimol/shared';
import { AppButton, Card, ErrorBanner, SectionTitle } from '../components/ui';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { RequestDetailSkeleton } from '../components/Skeleton';
import { StatusTimeline } from '../components/StatusTimeline';
import { FadeInUp } from '../components/motion';
import { EstimateComparison } from '../components/demolition/EstimateComparison';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
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
        // 이 탭의 이름은 역할마다 다르다(배출자 "내 요청", 운반 "콜 내역"…).
        // 빵부스러기에 '요청 관리'라고 박아 두면 눌러서 도착한 화면의 제목과 달라
        // 다른 곳으로 온 것처럼 읽힌다.
        { label: ROLE_CONFIG[user.userType].listTitle, onPress: () => nav.switchTab('requests') },
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

  const [activeTab, setActiveTab] = React.useState<'STATUS' | 'PAYMENT'>('STATUS');

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KIND_LABELS[request.kind]} canGoBack />
      {crumbs}
      <View style={styles.tabContainer}>
        <Text 
          style={[styles.tab, activeTab === 'STATUS' && styles.activeTab]} 
          onPress={() => setActiveTab('STATUS')}>
          진행 상태
        </Text>
        <Text 
          style={[styles.tab, activeTab === 'PAYMENT' && styles.activeTab]} 
          onPress={() => setActiveTab('PAYMENT')}>
          결제 내역
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.newRequestContainer}>
          <AppButton
            label="+ 다른 철거 추가 요청하기"
            variant="outline"
            onPress={() => nav.push({ name: 'requestForm', kind: 'DEMOLITION' })}
          />
        </View>
        {activeTab === 'STATUS' ? (
          <>
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
          </>
        ) : (
          <View style={{ padding: 16 }}>
            <SectionTitle>결제 및 정산 내역</SectionTitle>
            <Card>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
                {request.agreedFee ? `총 견적 금액: ${(request.agreedFee).toLocaleString()}원` : '결제 금액 미정'}
              </Text>
              <Text style={{ marginBottom: 4, color: '#666' }}>
                {`계약금 (예치완료): ${request.agreedFee ? (request.agreedFee * 0.1).toLocaleString() : 0}원`}
              </Text>
              <Text style={{ marginBottom: 16, color: '#666' }}>
                {`잔금 (미납): ${request.agreedFee ? (request.agreedFee * 0.9).toLocaleString() : 0}원`}
              </Text>
              <AppButton 
                label="영수증 다운로드" 
                variant="outline" 
                onPress={() => {}} 
              />
            </Card>
          </View>
        )}
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    fontSize: font.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
  activeTab: {
    color: colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  newRequestContainer: {
    marginBottom: spacing.sm,
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
