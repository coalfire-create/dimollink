import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { isValidEmail } from '@dimol/shared';
import { AppButton, Field } from './ui';
import { theme } from '../theme';

/**
 * 처음 결제할 때 한 번 묻는 이메일 입력창([[buyer-email]]).
 * 결제사(PG)가 결제창을 열 때 구매자 이메일을 요구하고, 결제 영수증도 이 주소로 간다.
 */
export function BuyerEmailModal({
  visible,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  onSubmit: (email: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const email = value.trim();
    if (!isValidEmail(email)) {
      setError('이메일 주소를 정확히 입력해 주세요.');
      return;
    }
    setError(null);
    onSubmit(email);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>이메일을 알려주세요</Text>
          <Text style={styles.desc}>
            결제 영수증을 보내 드릴 주소예요. 한 번만 입력하면 다음부터는 묻지 않아요.
          </Text>
          <Field
            label="이메일 주소"
            required
            value={value}
            onChangeText={setValue}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={submit}
            error={error}
          />
          <AppButton label="결제 계속하기" onPress={submit} />
          <AppButton label="취소" variant="outline" onPress={onClose} style={styles.cancel} />
        </View>
      </View>
    </Modal>
  );
}

const { colors, font, radius, spacing } = theme;

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  modal: {
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    maxWidth: 480,
    padding: spacing.lg,
    width: '100%',
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: '700', marginBottom: spacing.sm },
  desc: { color: colors.textMuted, fontSize: font.body, marginBottom: spacing.md },
  cancel: { marginTop: spacing.sm },
});
