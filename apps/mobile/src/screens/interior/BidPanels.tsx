import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { INTERIOR_BID_STATUS_LABELS, type InteriorRequest } from '@dimol/shared';
import { AppButton, Card, Field, SectionTitle, StatusBadge } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { won } from '../../lib/format';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';
import type { InteriorDetailState } from './useInteriorDetail';

/**
 * 밀봉 역경매의 양쪽 화면 — 소비자의 비교·낙찰과, 업체의 견적 제출.
 *
 * 두 역할이 같은 데이터를 전혀 다르게 본다. 소비자는 전부 보고 고르고, 업체는
 * 자기 것만 본다. 한 파일에 나란히 둔 건 그 대비가 규칙 자체이기 때문이다 —
 * 어느 쪽에 무엇이 보이는지 한 화면에서 확인할 수 있어야 실수로 새지 않는다.
 */
/** 소비자: 받은 밀봉 견적을 비교하고 한 곳을 낙찰한다. */
export function BidComparison({ detail }: { detail: InteriorDetailState }) {
  const { bids } = detail;
  return (
    <>
      <SectionTitle>받은 견적 ({bids.length})</SectionTitle>
      {bids.length > 0 ? (
        <>
          <Text style={styles.hint}>업체끼리는 서로 금액을 몰라요. 비교하고 한 곳을 고르세요.</Text>
          {bids.map((bid, index) => (
            <FadeInUp key={bid.id} delay={40 + index * 50}>
              <Card>
                <Text style={styles.bidAmount}>
                  {won(bid.amount)}
                  {index === 0 ? ' · 최저가' : ''}
                </Text>
                {bid.memo ? <Text style={styles.bidMemo}>{bid.memo}</Text> : null}
                <AppButton
                  label="이 업체 선택"
                  onPress={() => void detail.accept(bid.id)}
                  loading={detail.acceptingId === bid.id}
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
  );
}

/** 소비자: 낙찰 이후의 결과와 결제 진입. */
export function MatchResult({ request }: { request: InteriorRequest }) {
  const nav = useNavigation();
  return (
    <>
      <SectionTitle>매칭 결과</SectionTitle>
      <Card>
        {request.agreedFee !== undefined ? (
          <Text style={styles.bidAmount}>{won(request.agreedFee)}</Text>
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
  );
}

/** 업체: 내 밀봉 견적 현황과 제출 폼. 경쟁가는 여기서도 보이지 않는다. */
export function MyBidPanel({ detail }: { detail: InteriorDetailState }) {
  const { myBid, isOpen } = detail;
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  async function submit() {
    const ok = await detail.submitBid(amount, memo);
    if (ok) {
      setAmount('');
      setMemo('');
    }
  }

  return (
    <>
      <SectionTitle>내 견적</SectionTitle>
      {myBid ? (
        <Card>
          <View style={styles.row}>
            <Text style={styles.bidAmount}>{won(myBid.amount)}</Text>
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
            {myBid
              ? '금액을 다시 제출하면 최신 견적으로 반영돼요.'
              : '밀봉 견적을 넣어보세요. 다른 업체는 회원님 금액을 볼 수 없어요.'}
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
            onPress={() => void submit()}
            loading={detail.submitting}
          />
        </Card>
      ) : !myBid ? (
        <Card>
          <Text style={styles.hint}>이미 마감된 요청이에요.</Text>
        </Card>
      ) : null}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
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
