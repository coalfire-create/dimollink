import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  INTERIOR_BID_STATUS_LABELS,
  INTERIOR_CATEGORY_LABELS,
  REQUEST_STATUS_LABELS,
  type InteriorBid,
  type InteriorRequest,
} from '@dimol/shared';
import {
  ApiError,
  acceptInteriorBid,
  getInteriorRequest,
  listInteriorBids,
  submitInteriorBid,
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
 * 인테리어 요청 상세 (파일럿 밖 · FEATURE_INTERIOR).
 *
 * 밀봉 규칙은 서버가 강제한다 — listInteriorBids 는 인증 viewer 기준으로 필터된 입찰만 준다.
 * - 요청자(소비자): 전체 입찰을 최저가순으로 비교하고 한 곳을 낙찰한다.
 * - 업체: 자기 입찰만 보이며(경쟁가 비공개), 대기중이면 밀봉 견적을 제출/수정한다.
 */
export function InteriorDetailScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const user = useSession();
  const [request, setRequest] = useState<InteriorRequest | null>(null);
  const [bids, setBids] = useState<InteriorBid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getInteriorRequest(requestId);
      setRequest(r);
      setBids(await listInteriorBids(requestId).catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 불러오지 못했습니다.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(bidId: string) {
    setError(null);
    setAcceptingId(bidId);
    try {
      await acceptInteriorBid(bidId);
      await load(); // 요청이 MATCHED 로 바뀌고 낙찰 결과가 표시된다.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '낙찰에 실패했습니다.');
    } finally {
      setAcceptingId(null);
    }
  }

  async function submitBid() {
    setError(null);
    const num = Number(amount.replace(/\D/g, ''));
    if (!Number.isInteger(num) || num <= 0) {
      setError('견적 금액(원)을 정확히 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await submitInteriorBid(requestId, num, memo.trim() || undefined);
      setAmount('');
      setMemo('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '견적 제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!request) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="시공 요청" canGoBack />
        <ErrorBanner message={error} />
        {error ? null : <LoadingView />}
      </View>
    );
  }

  const isRequester = user.id === request.requesterId;
  const isOpen = request.status === 'REQUESTED';
  const sortedBids = [...bids].sort((a, b) => a.amount - b.amount);
  const myBid = sortedBids.find((b) => b.providerId === user.id) ?? null;

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
          {request.budget ? (
            <InfoRow label="희망 예산" value={`${request.budget.toLocaleString('ko-KR')}원`} />
          ) : null}
          {request.description ? (
            <InfoRow label="요구사항" value={request.description} />
          ) : null}
          <InfoRow label="접수일" value={new Date(request.createdAt).toLocaleDateString('ko-KR')} />
        </Card>

        {/* ── 소비자(요청자): 받은 밀봉 견적 비교·낙찰 ── */}
        {isRequester && isOpen ? (
          <>
            <SectionTitle>받은 견적 ({sortedBids.length})</SectionTitle>
            {sortedBids.length > 0 ? (
              <>
                <Text style={styles.hint}>업체끼리는 서로 금액을 몰라요. 비교하고 한 곳을 고르세요.</Text>
                {sortedBids.map((b, i) => (
                  <FadeInUp key={b.id} delay={40 + i * 50}>
                    <Card>
                      <Text style={styles.bidAmount}>
                        {b.amount.toLocaleString('ko-KR')}원{i === 0 ? ' · 최저가' : ''}
                      </Text>
                      {b.memo ? <Text style={styles.bidMemo}>{b.memo}</Text> : null}
                      <AppButton
                        label="이 업체 선택"
                        onPress={() => accept(b.id)}
                        loading={acceptingId === b.id}
                      />
                    </Card>
                  </FadeInUp>
                ))}
              </>
            ) : (
              <Card>
                <Text style={styles.hint}>아직 들어온 견적이 없어요. 조금만 기다려 주세요.</Text>
              </Card>
            )}
          </>
        ) : null}

        {/* ── 소비자: 낙찰 완료 후 결과 + 결제 ── */}
        {isRequester && !isOpen && request.status !== 'CANCELLED' ? (
          <>
            <SectionTitle>매칭 결과</SectionTitle>
            <Card>
              {request.agreedFee !== undefined ? (
                <Text style={styles.bidAmount}>{request.agreedFee.toLocaleString('ko-KR')}원</Text>
              ) : null}
              {request.status === 'MATCHED' ? (
                <>
                  <Text style={styles.hint}>선택한 업체로 매칭됐어요. 결제하면 시공이 시작돼요.</Text>
                  <AppButton
                    label="결제하기"
                    onPress={() =>
                      nav.push({ name: 'payment', requestId: request.id, source: 'interior' })
                    }
                  />
                </>
              ) : request.status === 'PAID' ? (
                <>
                  <Text style={styles.paidBadge}>✓ 결제 완료</Text>
                  <Text style={styles.hint}>업체가 곧 시공을 시작해요.</Text>
                </>
              ) : (
                <Text style={styles.hint}>선택한 업체로 진행 중이에요.</Text>
              )}
            </Card>
          </>
        ) : null}

        {/* ── 업체: 내 밀봉 견적 제출/현황 (경쟁가는 안 보인다) ── */}
        {!isRequester ? (
          <>
            <SectionTitle>내 견적</SectionTitle>
            {myBid ? (
              <Card>
                <View style={styles.row}>
                  <Text style={styles.bidAmount}>{myBid.amount.toLocaleString('ko-KR')}원</Text>
                  <StatusBadge status={myBid.status} label={INTERIOR_BID_STATUS_LABELS[myBid.status]} />
                </View>
                {myBid.memo ? <Text style={styles.bidMemo}>{myBid.memo}</Text> : null}
                <Text style={styles.hint}>
                  {myBid.status === 'ACCEPTED'
                    ? '축하해요! 이 요청에 낙찰됐어요.'
                    : myBid.status === 'REJECTED'
                      ? '다른 업체가 선정됐어요.'
                      : '제출 완료 · 소비자의 선택을 기다리는 중이에요. 다른 업체 금액은 볼 수 없어요.'}
                </Text>
              </Card>
            ) : null}

            {isOpen ? (
              <Card>
                <Text style={styles.hint}>
                  {myBid ? '금액을 다시 제출하면 최신 견적으로 반영돼요.' : '밀봉 견적을 넣어보세요. 다른 업체는 회원님 금액을 볼 수 없어요.'}
                </Text>
                <Field
                  label="견적 금액 (원)"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="예) 18000000"
                  keyboardType="number-pad"
                />
                <Field
                  label="메모 (선택)"
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="예) 자재 등급·공사 기간 안내"
                />
                <AppButton
                  label={myBid ? '견적 다시 제출' : '견적 제출'}
                  onPress={submitBid}
                  loading={submitting}
                />
              </Card>
            ) : !myBid ? (
              <Card>
                <Text style={styles.hint}>이미 마감된 요청이에요.</Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <ErrorBanner message={error} />
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
  hint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bidAmount: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  paidBadge: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.xs / 2,
  },
  bidMemo: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
    marginTop: spacing.xs / 2,
  },
});
