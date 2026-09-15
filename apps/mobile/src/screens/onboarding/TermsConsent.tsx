import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WEB_BASE_URL } from '../../api/client';
import { theme } from '../../theme';

/**
 * 약관 동의 — 필수 한 줄.
 *
 * 링크를 문장 안에 두는 이유: 따로 빼면 동의만 누르고 내용은 열어 보지 않는다.
 * 문장 안 링크는 읽는 중에 자연스럽게 눌린다.
 */
export function TermsConsent({ accepted, onToggle }: { accepted: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: accepted }}
      accessibilityLabel="이용약관 및 개인정보처리방침 동의 (필수)"
      onPress={onToggle}
      style={styles.row}
    >
      <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
        {accepted ? <Text style={styles.mark}>✓</Text> : null}
      </View>
      <Text style={styles.text}>
        {'(필수) '}
        <Text style={styles.link} onPress={() => void Linking.openURL(`${WEB_BASE_URL}/terms`)}>
          이용약관
        </Text>
        {' 및 '}
        <Text style={styles.link} onPress={() => void Linking.openURL(`${WEB_BASE_URL}/privacy`)}>
          개인정보처리방침
        </Text>
        에 동의합니다
      </Text>
    </Pressable>
  );
}

const { colors, font, spacing, touch } = theme;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    // 체크박스(24px)만 세면 누를 곳이 32px 밖에 안 됐다. 가입을 막는 필수 항목이라
    // 다른 버튼과 같은 48px 터치 영역을 준다.
    minHeight: touch.minButtonHeight,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mark: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
  text: {
    flex: 1,
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 6,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
