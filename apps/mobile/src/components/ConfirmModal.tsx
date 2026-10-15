import React from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { AppButton } from './ui';
import { theme } from '../theme';

/**
 * 확인 모달 — 되돌리기 어려운 동작(작성 중 이탈, 삭제 등) 직전에 한 번 묻는다.
 *
 * RN 의 Alert 를 쓰지 않는 이유: 웹(Expo web)에서는 브라우저 기본 대화상자로 나와
 * 앱 톤·글자 크기 기준(18px+)을 지킬 수 없다. 여기서는 한 컴포넌트로 세 플랫폼에서
 * 같은 모양이 나온다.
 */

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작이면 확인 버튼을 경고색으로. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="닫기"
      >
        {/* 바깥을 눌러 닫되, 안쪽 탭은 통과하지 않게 별도 Pressable 로 막는다. */}
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          <AppButton
            label={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            onPress={onConfirm}
            style={styles.button}
          />
          <AppButton
            label={cancelLabel}
            variant="outline"
            onPress={onCancel}
            style={styles.button}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(11, 27, 58, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.md,
    width: '100%',
    maxWidth: 480,
    ...theme.shadow.card,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  button: {
    marginBottom: spacing.xs,
  },
});
