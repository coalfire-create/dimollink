import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { MARKET_RATE_MIN_SAMPLE, type MarketRate, type ProviderRole } from '@dimol/shared';
import { Card } from './ui';
import { won } from '../lib/format';
import { theme } from '../theme';

/**
 * 요즘 평균 시세 카드 — 홈 화면 네 곳(배출자·철거업체·운반업체·처리장)이 같이 쓴다.
 *
 * 표본이 적으면 아무것도 그리지 않는다. 견적 두세 건의 평균을 "시세"라고 내보이면
 * 우연히 비싼 한 건이 기준이 되어, 배출자는 그 값을 정상으로 받아들이고 업체는
 * 거기에 맞춰 부른다. 기준값은 정책이라 [[quote]](shared)에 있다.
 *
 * "참고용"이라고 반드시 적는다 — 이 숫자는 견적이 아니다.
 */
const RATE_TITLE: Record<ProviderRole, string> = {
  TRANSPORT: '요즘 운반 평균 시세',
  DISPOSAL: '요즘 처리 평균 시세',
};

export function MarketRateCard({
  rate,
  party,
}: {
  rate: MarketRate | null;
  /** 어느 쪽 시세인지. 없으면(해당 없는 가입 유형) 그리지 않는다. */
  party?: ProviderRole;
}) {
  if (!party || !rate) return null;
  if (rate.quoteCount < MARKET_RATE_MIN_SAMPLE || rate.averageAmount === null) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{RATE_TITLE[party]}</Text>
      <Text style={styles.amount}>{won(rate.averageAmount)}</Text>
      <Text style={styles.note}>최근 견적 {rate.quoteCount}건 기준 참고용이에요</Text>
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  amount: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginVertical: spacing.xs / 2,
  },
  note: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
});
