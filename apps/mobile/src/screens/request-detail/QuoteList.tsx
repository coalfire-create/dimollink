import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Quote } from '@dimol/shared';
import { AppButton, Card, SectionTitle } from '../../components/ui';
import { won } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 받은 견적 목록 — 운반·처리의 단발 견적을 값으로 비교하고 고르는 자리.
 *
 * 항상 최저가 순으로 정렬하고 첫 칸에 「최저가」를 붙인다. 도착한 순서로 두면
 * 먼저 보낸 업체가 유리해지는데, 이 목록은 선착순이 아니라 가격 비교가 목적이다.
 * (철거는 현장을 봐야 값이 나오므로 여기가 아니라 개산/실사/확정 흐름을 쓴다.)
 */
export function QuoteList({
  quotes,
  acceptingQuoteId,
  onAccept,
}: {
  quotes: Quote[];
  acceptingQuoteId: string | null;
  onAccept: (quoteId: string) => void;
}) {
  if (quotes.length === 0) return null;

  const sorted = [...quotes].sort((a, b) => a.amount - b.amount);

  return (
    <>
      <SectionTitle>받은 견적 ({quotes.length})</SectionTitle>
      <Text style={styles.hint}>가격을 비교하고 선택하세요.</Text>
      {sorted.map((quote, index) => {
        const cheapest = index === 0;
        return (
          <Card key={quote.id} style={cheapest ? styles.bestCard : undefined}>
            <View style={styles.header}>
              <Text style={styles.providerName}>{quote.providerName || '철거업체'}</Text>
              {cheapest ? (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>최저가</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.amount}>{won(quote.amount)}</Text>
            </View>
            <Text style={styles.time}>
              {new Date(quote.createdAt).toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
              })}
            </Text>
            {quote.memo ? <Text style={styles.memo}>{quote.memo}</Text> : null}
            <AppButton
              label="이 견적 선택"
              onPress={() => onAccept(quote.id)}
              loading={acceptingQuoteId === quote.id}
            />
          </Card>
        );
      })}
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
  bestCard: {
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  providerName: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amount: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  time: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
    marginBottom: spacing.xs,
  },
  memo: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.xs,
    marginTop: spacing.xs / 2,
  },
});
