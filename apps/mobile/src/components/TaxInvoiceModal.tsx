import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View, Pressable } from 'react-native';
import { AppButton, Field } from './ui';
import { theme } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (info: { businessNumber: string; email: string }) => void;
  amount: number;
};

export function TaxInvoiceModal({ visible, onClose, onSubmit, amount }: Props) {
  const [businessNumber, setBusinessNumber] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    onSubmit({ businessNumber, email });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>세금계산서 / 현금영수증 발행</Text>
          <Text style={styles.desc}>
            결제하신 금액 {(amount).toLocaleString()}원에 대해 증빙을 발행합니다.
          </Text>

          <Field
            label="사업자등록번호 (또는 휴대전화번호)"
            value={businessNumber}
            onChangeText={setBusinessNumber}
            placeholder="- 없이 입력"
            keyboardType="numeric"
          />
          <Field
            label="이메일 주소"
            value={email}
            onChangeText={setEmail}
            placeholder="세금계산서를 받으실 이메일"
            keyboardType="email-address"
          />

          <View style={styles.buttonRow}>
            <Pressable onPress={onClose} style={[styles.button, styles.cancelButton]}>
              <Text style={styles.cancelText}>다음에 하기</Text>
            </Pressable>
            <AppButton 
              label="발행 요청"
              onPress={handleSubmit}
              style={[styles.button, { flex: 1 }]} 
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { colors, radius, spacing, font } = theme;
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modal: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  title: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  desc: {
    fontSize: font.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: '600',
  }
});
