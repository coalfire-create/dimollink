import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  offersTransportLabel,
  pricingUnitLabel,
  usesOffersTransport,
  usesPricing,
  type UserProfile,
} from '@dimol/shared';
import { getPricing, setOffersTransport, setPricing } from '../../api/client';
import { AppButton, Card, ErrorBanner, Field, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 업체 전용 설정 — 운반요청 수신 여부와 기준 단가.
 *
 * 둘 다 "이 업체가 어떤 일을 얼마에 받는가"를 정하는 값이라, 계정 정보와 섞지 않고
 * 따로 묶었다. 소비자 계정에서는 통째로 사라진다(usesOffersTransport·usesPricing).
 */
export function CompanySettings({ user }: { user: UserProfile }) {
  return (
    <>
      {usesOffersTransport(user.userType) ? <TransportOfferToggle user={user} /> : null}
      {usesPricing(user.userType) ? <PricingCard user={user} /> : null}
    </>
  );
}

/** 처리장이 운반요청도 함께 받는지 — 배출자에게 배지로 보인다. */
function TransportOfferToggle({ user }: { user: UserProfile }) {
  // 세션 값으로 시작하고 토글 시 로컬 상태로 반영한다(availability 와 같은 패턴).
  const [offers, setOffers] = useState(user.offersTransport ?? false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !offers;
    setBusy(true);
    try {
      const updated = await setOffersTransport(user.id, next);
      setOffers(updated.offersTransport ?? next);
    } catch {
      // 실패 시 상태를 유지한다(알림은 후속).
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>운반요청 설정</SectionTitle>
      <Card>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="운반요청 받기"
          accessibilityState={{ checked: offers, busy }}
          onPress={toggle}
          disabled={busy}
          style={styles.toggleRow}
        >
          <View style={styles.toggleTextBox}>
            <Text style={styles.toggleLabel}>운반요청도 함께 받기</Text>
            <Text style={styles.toggleHint}>
              {offersTransportLabel(offers)} · 배출자에게 배지로 표시돼요
            </Text>
          </View>
          <View style={[styles.switchTrack, offers && styles.switchTrackOn]}>
            <View style={[styles.switchThumb, offers && styles.switchThumbOn]} />
          </View>
        </Pressable>
      </Card>
    </>
  );
}

/** 기준 단가 — 견적 제출 시 예상 금액의 기본값이 된다. */
function PricingCard({ user }: { user: UserProfile }) {
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPricing(user.id)
      .then((pricing) => {
        if (!pricing) return;
        setSaved(pricing.unitPrice);
        setInput(String(pricing.unitPrice));
      })
      .catch(() => undefined);
  }, [user.id]);

  async function save() {
    setError(null);
    setDone(false);
    const value = Number(input.replace(/\D/g, ''));
    if (!Number.isInteger(value) || value <= 0) {
      setError('단가(원, 양의 정수)를 정확히 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const result = await setPricing(user.id, value);
      setSaved(result.unitPrice);
      setInput(String(result.unitPrice));
      setDone(true);
    } catch {
      setError('단가 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const unit = pricingUnitLabel(user.userType);

  return (
    <>
      <SectionTitle>내 단가</SectionTitle>
      <Card>
        <Field
          label={`기준 단가 (${unit})`}
          value={input}
          onChangeText={(v) => setInput(v.replace(/[^0-9]/g, ''))}
          placeholder="예) 80000"
          keyboardType="number-pad"
          hint={
            saved !== null
              ? `현재 저장된 단가: ${saved.toLocaleString('ko-KR')}${unit} · 견적 예상금액에 반영돼요`
              : '견적 제출 시 예상 금액 기본값으로 쓰여요.'
          }
        />
        <ErrorBanner message={error} />
        {done ? <Text style={styles.priceDone}>단가를 저장했어요</Text> : null}
        <AppButton label="단가 저장" onPress={save} loading={busy} />
      </Card>
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touch.minButtonHeight,
  },
  toggleTextBox: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  toggleHint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  switchTrack: {
    width: 56,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.border,
    padding: spacing.xs / 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: colors.primary,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  priceDone: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
});
