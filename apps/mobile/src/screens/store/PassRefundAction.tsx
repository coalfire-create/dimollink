import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PASS_REFUND_WINDOW_DAYS, type MembershipPass } from '@dimol/shared';
import { AppButton } from '../../components/ui';
import { theme } from '../../theme';
import type { StoreCheckoutState } from './useStoreCheckout';

/**
 * 이용권 환불 버튼 — 한 번 더 확인한 뒤 환불한다.
 *
 * 환불하면 혜택이 바로 끝나서 잘못 누르면 되돌릴 수 없다(다시 결제해야 한다).
 * 그래서 첫 탭은 확인 문구만 띄우고, 두 번째 탭에서 서버에 요청한다.
 */
export function PassRefundAction({
  pass,
  store,
}: {
  pass: MembershipPass;
  store: StoreCheckoutState;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <AppButton
        label={`환불하기 (결제 후 ${PASS_REFUND_WINDOW_DAYS}일 이내)`}
        variant="outline"
        onPress={() => setConfirming(true)}
      />
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.question}>
        {pass.amount.toLocaleString()}원을 환불할까요? 환불하면 혜택이 바로 끝납니다.
      </Text>
      <AppButton
        label="환불 확정"
        loading={store.busyId === pass.id}
        onPress={() => {
          setConfirming(false);
          void store.refund(pass);
        }}
      />
      <AppButton label="취소" variant="outline" onPress={() => setConfirming(false)} />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  question: { color: colors.text, fontSize: font.body, fontWeight: '700' },
});
