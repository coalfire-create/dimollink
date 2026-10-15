import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AddressPickerField } from '../../components/AddressPickerField';
import { theme } from '../../theme';
import type { RequestFormState } from './useRequestForm';

/**
 * 운반 요청 전용 입력 — 상차지·하차지 두 주소.
 *
 * 사진 첨부는 철거 요청과 목적이 다르다. 철거는 "공정·위험 요인"을 보지만,
 * 운반은 "무엇을 싣는지(소재)"만 알면 되므로 잠금 단계 없이 바로 찍을 수 있다.
 */
export function TransportSection({ form }: { form: RequestFormState }) {
  const { fieldErrors } = form;
  return (
    <>
      <AddressPickerField
        label="상차지 주소 (폐기물을 싣는 곳)"
        value={form.loadAddress}
        onChangeAddress={form.setLoadAddressPicked}
        placeholder="예) ○○시 ○○구 ○○동 12-3"
        error={fieldErrors.loadAddress}
      />
      <AddressPickerField
        label="하차지 주소 (폐기물을 내리는 곳)"
        value={form.unloadAddress}
        onChangeAddress={form.setUnloadAddressPicked}
        placeholder="예) ○○시 ○○구 처리장"
        error={fieldErrors.unloadAddress}
      />
    </>
  );
}

/** 운반 요청의 사진 첨부 — 소재 자동분류용. 소재 입력칸 바로 앞에 온다. */
export function TransportPhotoButtons({ form }: { form: RequestFormState }) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        style={styles.fillBtn}
        onPress={() => form.setCameraOpen(true)}
        disabled={form.photoBusy}
      >
        <Text style={styles.fillText}>
          {form.photoBusy ? '사진 업로드 중…' : '사진 첨부 (소재 자동분류)'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.altBtn}
        onPress={form.fillFromPhoto}
        disabled={form.photoBusy}
      >
        <Text style={styles.altText}>또는 앨범에서 선택</Text>
      </Pressable>
      {form.photoSummary ? <Text style={styles.summary}>{form.photoSummary}</Text> : null}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  fillBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  fillText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
  },
  altBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    marginBottom: spacing.xs,
  },
  altText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  summary: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
  },
});
