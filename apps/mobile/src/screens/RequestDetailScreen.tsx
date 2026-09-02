import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ASBESTOS_RISK_LABELS,
  BUILDING_TYPE_LABELS,
  DEMOLITION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  asbestosRisk,
  isRequestCancellable,
  ledgerDisplayRows,
  type MatchStatus,
  type Quote,
  type ServiceRequest,
} from '@dimol/shared';
import {
  ApiError,
  acceptQuote,
  cancelPayment,
  cancelRequest,
  getRequest,
  listQuotes,
  updateRequestStatus,
} from '../api/client';
import {
  AppButton,
  Card,
  ErrorBanner,
  Field,
  InfoRow,
  LoadingView,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/**
 * 요청 상세 — 상태 타임라인 + 취소 + 채팅 진입.
 * 취소 버튼 노출은 shared 의 isRequestCancellable 로 서버 전이 규칙과 일치시킨다
 * (진행중부터는 취소 불가 — 취소 정책).
 */

const TIMELINE: MatchStatus[] = [
  'REQUESTED',
  'MATCHED',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'SETTLED',
];

const KIND_LABELS: Record<ServiceRequest['kind'], string> = {
  DEMOLITION: '철거 요청',
  TRANSPORT: '운반 요청',
  DISPOSAL_RESERVATION: '처리장 예약',
};

export function RequestDetailScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const user = useSession();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [refundMode, setRefundMode] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getRequest(requestId);
      setRequest(r);
      // 내 요청이고 아직 매칭 대기중이면 받은 견적을 불러온다(가격 비교·선택).
      if (r.requesterId === user.id && r.status === 'REQUESTED') {
        setQuotes(await listQuotes(requestId).catch(() => []));
      } else {
        setQuotes([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.');
    }
  }, [requestId, user.id]);

  async function acceptQuoteAndMatch(quoteId: string) {
    setError(null);
    setAcceptingQuoteId(quoteId);
    try {
      await acceptQuote(quoteId);
      await load(); // 요청이 MATCHED 로 바뀌고 견적 섹션은 사라진다.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적 수락에 실패했습니다.');
    } finally {
      setAcceptingQuoteId(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  // 업체(매칭 확정 업체)가 작업 상태를 진행한다.
  async function advance(status: 'IN_PROGRESS' | 'COMPLETED') {
    setError(null);
    setAdvancing(true);
    try {
      setRequest(await updateRequestStatus(requestId, status));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '상태 변경에 실패했습니다.');
    } finally {
      setAdvancing(false);
    }
  }

  async function confirmRefund() {
    if (!request?.paymentId) return;
    setError(null);
    setRefunding(true);
    try {
      // 결제완료(배차 전) 취소 = 전액 환불. 서버가 결제자·금액을 검증한다.
      await cancelPayment({ paymentId: request.paymentId, stage: 'BEFORE_DISPATCH' });
      setRefundMode(false);
      await load(); // 요청이 CANCELLED 로 전이된다.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '환불 처리에 실패했습니다.');
    } finally {
      setRefunding(false);
    }
  }

  async function confirmCancel() {
    setError(null);
    setCancelling(true);
    try {
      setRequest(await cancelRequest(requestId, cancelReason.trim() || '사용자 취소'));
      setCancelMode(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '취소에 실패했습니다.');
    } finally {
      setCancelling(false);
    }
  }

  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="요청 상세" canGoBack />
        <ErrorBanner message={error} />
        {error ? null : <LoadingView />}
      </View>
    );
  }

  const cancelled = request.status === 'CANCELLED';
  const isRequester = user.id === request.requesterId;
  const isProvider = user.id === request.matchedProviderId;
  const activeIndex = TIMELINE.indexOf(request.status);
  const counterpartyId = request.matchedProviderId
    ? user.id === request.requesterId
      ? request.matchedProviderId
      : request.requesterId
    : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KIND_LABELS[request.kind]} canGoBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusHeader}>
          <StatusBadge status={request.status} label={REQUEST_STATUS_LABELS[request.status]} />
        </View>

        {!cancelled ? (
          <FadeInUp delay={40}>
            <Card>
              {TIMELINE.map((step, index) => {
                const reached = index <= activeIndex;
                const isCurrent = index === activeIndex;
                const isLast = index === TIMELINE.length - 1;
                return (
                  <View key={step} style={styles.timelineRow}>
                    <View style={styles.timelineMarker}>
                      <View
                        style={[
                          styles.timelineDot,
                          reached && styles.timelineDotReached,
                          isCurrent && styles.timelineDotCurrent,
                        ]}
                      />
                      {!isLast ? (
                        <View
                          style={[styles.timelineLine, reached && styles.timelineLineReached]}
                        />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.timelineLabel,
                        reached && { color: colors.text },
                        isCurrent && { fontWeight: '800', color: colors.primary },
                      ]}
                    >
                      {REQUEST_STATUS_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </FadeInUp>
        ) : (
          <FadeInUp delay={40}>
            <Card>
              <Text style={styles.cancelledTitle}>취소된 요청이에요</Text>
              {request.cancelReason ? (
                <Text style={styles.cancelledReason}>사유: {request.cancelReason}</Text>
              ) : null}
            </Card>
          </FadeInUp>
        )}

        <SectionTitle>요청 정보</SectionTitle>
        <Card>
          <InfoRow label="지역" value={request.region} />
          {request.kind !== 'DEMOLITION' ? (
            <InfoRow label="예상 무게" value={`${request.wasteTons}톤`} />
          ) : null}
          <InfoRow
            label="올바로 신고"
            value={request.allbaroRequested ? '신청함' : '간이 확인서'}
          />
          {request.kind === 'DEMOLITION' ? (
            <>
              <InfoRow label="현장 주소" value={request.siteAddress} />
              {request.demolitionDetails?.buildingType ? (
                <InfoRow
                  label="건물 종류"
                  value={
                    BUILDING_TYPE_LABELS[request.demolitionDetails.buildingType] ??
                    request.demolitionDetails.buildingType
                  }
                />
              ) : null}
              {request.demolitionDetails?.demolitionType ? (
                <InfoRow
                  label="철거 종류"
                  value={
                    DEMOLITION_TYPE_LABELS[request.demolitionDetails.demolitionType] ??
                    request.demolitionDetails.demolitionType
                  }
                />
              ) : null}
              {request.demolitionDetails?.spaceSize ? (
                <InfoRow label="평수 / 면적" value={request.demolitionDetails.spaceSize} />
              ) : null}
              {request.demolitionDetails?.floorCount ? (
                <InfoRow label="층수" value={request.demolitionDetails.floorCount} />
              ) : null}
              {request.demolitionDetails?.hasElevator !== undefined ? (
                <InfoRow
                  label="엘리베이터"
                  value={request.demolitionDetails.hasElevator ? '있음' : '없음'}
                />
              ) : null}
              {request.demolitionDetails?.hasVehicleAccess !== undefined ? (
                <InfoRow
                  label="차량/사다리 진입"
                  value={request.demolitionDetails.hasVehicleAccess ? '가능' : '불가'}
                />
              ) : null}
              {request.demolitionDetails?.desiredDate ? (
                <InfoRow label="희망 철거일" value={request.demolitionDetails.desiredDate} />
              ) : null}
              {request.demolitionDetails?.description ? (
                <InfoRow label="상세 요구사항" value={request.demolitionDetails.description} />
              ) : null}
              {ledgerDisplayRows(request.demolitionDetails?.buildingLedger).map((row) => (
                <InfoRow key={`ledger-${row.label}`} label={`대장 ${row.label}`} value={row.value} />
              ))}
              {request.demolitionDetails?.buildingLedger &&
              (asbestosRisk(request.demolitionDetails.buildingLedger) === 'HIGH' ||
                asbestosRisk(request.demolitionDetails.buildingLedger) === 'POSSIBLE') ? (
                <InfoRow
                  label="⚠️ 석면"
                  value={`${ASBESTOS_RISK_LABELS[asbestosRisk(request.demolitionDetails.buildingLedger)]} — 철거 전 석면 사전조사 필요`}
                />
              ) : null}
              {request.demolitionDetails?.dimolVisionAnalysis?.summary ? (
                <InfoRow
                  label="✨ 디몰비전 분석"
                  value={request.demolitionDetails.dimolVisionAnalysis.summary}
                />
              ) : null}
            </>
          ) : null}
          {request.kind === 'TRANSPORT' ? (
            <>
              <InfoRow label="상차지" value={request.loadAddress} />
              <InfoRow label="하차지" value={request.unloadAddress} />
            </>
          ) : null}
          {request.kind === 'DISPOSAL_RESERVATION' ? (
            <InfoRow
              label="방문 일시"
              value={new Date(request.visitAt).toLocaleString('ko-KR', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            />
          ) : null}
          <InfoRow label="현장 사진" value={`${request.sitePhotoKeys.length}장`} />
          <InfoRow label="접수일" value={new Date(request.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        {quotes.length > 0 ? (
          <>
            <SectionTitle>받은 견적 ({quotes.length})</SectionTitle>
            <Text style={styles.quoteHint}>가격을 비교하고 선택하세요.</Text>
            {[...quotes]
              .sort((a, b) => a.amount - b.amount)
              .map((q, i) => (
                <Card key={q.id} style={i === 0 ? styles.bestQuoteCard : undefined}>
                  <View style={styles.quoteRow}>
                    <Text style={styles.quoteAmount}>{q.amount.toLocaleString('ko-KR')}원</Text>
                    {i === 0 ? (
                      <View style={styles.bestBadge}>
                        <Text style={styles.bestBadgeText}>최저가</Text>
                      </View>
                    ) : null}
                  </View>
                  {q.memo ? <Text style={styles.quoteMemo}>{q.memo}</Text> : null}
                  <AppButton
                    label="이 견적 선택"
                    onPress={() => acceptQuoteAndMatch(q.id)}
                    loading={acceptingQuoteId === q.id}
                  />
                </Card>
              ))}
          </>
        ) : null}

        {isRequester && request.agreedFee !== undefined && request.status === 'MATCHED' ? (
          <>
            <SectionTitle>결제</SectionTitle>
            <Card>
              <Text style={styles.payAmount}>{request.agreedFee.toLocaleString('ko-KR')}원</Text>
              <Text style={styles.quoteHint}>합의 금액 · 결제하면 작업이 시작돼요.</Text>
              <AppButton
                label="결제하기"
                onPress={() => nav.push({ name: 'payment', requestId: request.id })}
              />
            </Card>
          </>
        ) : null}

        {isRequester && request.status === 'PAID' ? (
          <Card>
            <Text style={styles.paidBadge}>✓ 결제 완료</Text>
            {request.agreedFee !== undefined ? (
              <Text style={styles.quoteHint}>
                {request.agreedFee.toLocaleString('ko-KR')}원 결제됨
              </Text>
            ) : null}
            {request.paymentId ? (
              refundMode ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={styles.cancelPolicy}>
                    아직 배차 전이라 전액 환불돼요. 정말 취소·환불하시겠어요?
                  </Text>
                  <AppButton
                    label="취소하고 환불받기"
                    variant="danger"
                    onPress={confirmRefund}
                    loading={refunding}
                  />
                  <View style={{ height: spacing.xs }} />
                  <AppButton
                    label="돌아가기"
                    variant="outline"
                    onPress={() => setRefundMode(false)}
                  />
                </View>
              ) : (
                <AppButton
                  label="결제 취소·환불"
                  variant="danger"
                  style={{ marginTop: spacing.sm }}
                  onPress={() => setRefundMode(true)}
                />
              )
            ) : null}
          </Card>
        ) : null}

        {isProvider && (request.status === 'PAID' || request.status === 'IN_PROGRESS') ? (
          <>
            <SectionTitle>작업 진행</SectionTitle>
            <Card>
              {request.status === 'PAID' ? (
                <>
                  <Text style={styles.quoteHint}>현장 도착 후 작업을 시작하세요.</Text>
                  <AppButton
                    label="작업 시작"
                    onPress={() => advance('IN_PROGRESS')}
                    loading={advancing}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.quoteHint}>작업이 끝나면 완료 처리하세요.</Text>
                  <AppButton
                    label="작업 완료"
                    onPress={() => advance('COMPLETED')}
                    loading={advancing}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}

        {counterpartyId && !cancelled ? (
          <>
            <SectionTitle>매칭 업체와 대화</SectionTitle>
            <AppButton
              label="채팅하기"
              variant="outline"
              onPress={() => nav.push({ name: 'chat', requestId: request.id, counterpartyId })}
            />
            
            {request.kind === 'TRANSPORT' && (request.status === 'PAID' || request.status === 'IN_PROGRESS') ? (
              <AppButton
                label="실시간 트럭 위치 확인"
                variant="primary"
                style={{ marginTop: spacing.sm }}
                onPress={() => nav.push({ name: 'tracking', requestId: request.id })}
              />
            ) : null}
          </>
        ) : null}

        {counterpartyId && (request.status === 'COMPLETED' || request.status === 'SETTLED') ? (
          <>
            <SectionTitle>서비스 평가</SectionTitle>
            <AppButton
              label="리뷰 남기기"
              variant="outline"
              onPress={() => nav.push({ name: 'reviewForm', requestId: request.id })}
            />
          </>
        ) : null}

        <ErrorBanner message={error} />

        {isRequestCancellable(request.status) ? (
          cancelMode ? (
            <Card style={{ marginTop: spacing.sm }}>
              <Text style={styles.cancelConfirmTitle}>정말 취소하시겠어요?</Text>
              <Text style={styles.cancelPolicy}>
                업체 배차 후에 취소하면 위약금 10%를 뺀 금액이 환불돼요. 배차 전에는 전액 환불돼요.
              </Text>
              <Field
                label="취소 사유 (선택)"
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="예) 일정이 변경됐어요"
              />
              <AppButton
                label="요청 취소하기"
                variant="danger"
                onPress={confirmCancel}
                loading={cancelling}
              />
              <View style={{ height: spacing.xs }} />
              <AppButton label="돌아가기" variant="outline" onPress={() => setCancelMode(false)} />
            </Card>
          ) : (
            <AppButton
              label="요청 취소"
              variant="danger"
              style={{ marginTop: spacing.sm }}
              onPress={() => setCancelMode(true)}
            />
          )
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
  statusHeader: {
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineMarker: {
    alignItems: 'center',
    marginRight: spacing.sm,
    width: spacing.md,
  },
  timelineDot: {
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 12,
    marginTop: 4,
    width: 12,
  },
  timelineDotReached: {
    backgroundColor: colors.primary,
  },
  timelineDotCurrent: {
    borderColor: colors.primarySoft,
    borderWidth: 4,
    height: 18,
    marginTop: 1,
    width: 18,
  },
  timelineLine: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 2,
    minHeight: 20,
    width: 2,
  },
  timelineLineReached: {
    backgroundColor: colors.primary,
  },
  timelineLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    paddingBottom: spacing.sm,
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
  cancelConfirmTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  cancelPolicy: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
  },
  quoteHint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
  },
  bestQuoteCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  bestBadge: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  bestBadgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '800',
  },
  quoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteAmount: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  quoteMemo: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
    marginTop: spacing.xs / 2,
  },
  payAmount: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  paidBadge: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
});
