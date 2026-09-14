import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  VISION_MATERIAL_TAXONOMY_V1,
  visionMaterialLabel,
  wasteItemsToTons,
  type VisionMaterialCode,
  type WasteItem,
} from '@dimol/shared';
import { theme } from '../theme';

/**
 * 소재별 폐기물 무게(kg) 반복 입력 (Phase 1 — 처리장/운반 요청).
 * 한 줄에 소재 드롭다운 + kg 숫자칸을 두고, 줄 추가/삭제로 여러 소재를 기재한다.
 * 소재 종류는 디몰비전 자재 분류 12종(VisionMaterialCode)을 재사용한다.
 *
 * 폼 상태는 문자열(kg)을 그대로 들고 있다가 제출 직전에 draftsToWasteItems 로 변환한다.
 */

export interface WasteItemDraft {
  material: VisionMaterialCode | '';
  kg: string;
}

export const emptyWasteDraft = (): WasteItemDraft => ({ material: '', kg: '' });

/** 드래프트 → 유효한 소재 항목만 추출(소재 미선택·비양수 kg 제외). */
export function draftsToWasteItems(drafts: readonly WasteItemDraft[]): WasteItem[] {
  const items: WasteItem[] = [];
  for (const d of drafts) {
    const kg = Number(d.kg);
    if (d.material && Number.isFinite(kg) && kg > 0) items.push({ material: d.material, kg });
  }
  return items;
}

/** 소재 항목(서버/AI 결과) → 폼 드래프트. 프리필에 사용. */
export function wasteItemsToDrafts(items: readonly WasteItem[]): WasteItemDraft[] {
  if (items.length === 0) return [emptyWasteDraft()];
  return items.map((i) => ({ material: i.material, kg: String(i.kg) }));
}

export function WasteItemsInput({
  items,
  onChange,
}: {
  items: WasteItemDraft[];
  onChange: (next: WasteItemDraft[]) => void;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  const update = (i: number, patch: Partial<WasteItemDraft>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addRow = () => onChange([...items, emptyWasteDraft()]);
  const removeRow = (i: number) =>
    onChange(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);

  const valid = draftsToWasteItems(items);
  const totalTons = wasteItemsToTons(valid);
  const totalKg = valid.reduce((s, it) => s + it.kg, 0);

  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={styles.label}>폐기물 소재별 무게 (kg)</Text>
      <Text style={styles.hint}>소재를 고르고 예상 무게(kg)를 적어 주세요. 소재가 여러 개면 줄을 추가하세요.</Text>

      {items.map((item, i) => (
        <View key={i} style={styles.rowWrap}>
          <View style={styles.row}>
            <Pressable
              style={styles.select}
              onPress={() => setOpenRow(openRow === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel="소재 선택"
            >
              <Text
                style={[styles.selectText, !item.material && styles.selectPlaceholder]}
                numberOfLines={1}
              >
                {item.material ? visionMaterialLabel(item.material) : '소재 선택'}
              </Text>
              <Text style={styles.caret}>{openRow === i ? '▲' : '▼'}</Text>
            </Pressable>
            <TextInput
              style={styles.kgInput}
              value={item.kg}
              onChangeText={(t) => update(i, { kg: t.replace(/[^0-9]/g, '') })}
              placeholder="kg"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel="예상 무게 kg"
            />
            <Pressable
              style={styles.removeBtn}
              onPress={() => removeRow(i)}
              disabled={items.length <= 1}
              accessibilityRole="button"
              accessibilityLabel="이 소재 줄 삭제"
            >
              <Text style={[styles.removeText, items.length <= 1 && styles.removeDisabled]}>✕</Text>
            </Pressable>
          </View>
          {openRow === i ? (
            <View style={styles.options}>
              {VISION_MATERIAL_TAXONOMY_V1.map((m) => (
                <Pressable
                  key={m.code}
                  style={[styles.option, item.material === m.code && styles.optionActive]}
                  onPress={() => {
                    update(i, { material: m.code });
                    setOpenRow(null);
                  }}
                >
                  <Text
                    style={[styles.optionText, item.material === m.code && styles.optionTextActive]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <Pressable style={styles.addBtn} onPress={addRow} accessibilityRole="button">
        <Text style={styles.addText}>＋ 소재 추가</Text>
      </Pressable>

      {totalKg > 0 ? (
        <Text style={styles.total}>
          합계 약 {totalTons}톤 ({totalKg.toLocaleString('ko-KR')}kg)
        </Text>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
  },
  rowWrap: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  select: {
    flex: 1,
    minHeight: touch.minButtonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
  },
  selectText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    flex: 1,
  },
  selectPlaceholder: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  caret: {
    color: colors.textMuted,
    fontSize: theme.glyph.inline,
    marginLeft: spacing.xs,
  },
  kgInput: {
    width: 96,
    minHeight: touch.minButtonHeight,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'right',
  },
  removeBtn: {
    width: touch.minButtonHeight,
    height: touch.minButtonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.error,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  removeDisabled: {
    color: colors.border,
  },
  options: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionActive: {
    backgroundColor: colors.primarySoft,
  },
  optionText: {
    color: colors.text,
    fontSize: font.body,
  },
  optionTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  addBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.primarySoft,
  },
  addText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
  },
  total: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
});
