import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AddressPickerField } from '../../components/AddressPickerField';
import { ListGroup, ListRow } from '../../components/ui';
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
      <ListGroup>
        <ListRow
          icon="camera"
          title="사진 찍어 첨부"
          subtitle="폐기물 소재를 사진으로 자동 분류해요"
          busy={form.photoBusy}
          onPress={() => form.setCameraOpen(true)}
        />
        <ListRow
          icon="image"
          title="앨범에서 선택"
          subtitle="이미 찍어 둔 사진을 올려요"
          disabled={form.photoBusy}
          onPress={form.fillFromPhoto}
        />
      </ListGroup>
      {form.photoSummary ? <Text style={styles.summary}>{form.photoSummary}</Text> : null}
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  summary: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
  },
});
