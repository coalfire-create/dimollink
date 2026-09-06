import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { REFERENCE_OBJECTS, type ReferenceObject } from '@dimol/shared';
import { theme } from '../theme';

/**
 * 기준 물체 선택 — "방금 잰 그 물건이 무엇인가".
 *
 * 3D 화면에서 잰 길이는 복원 좌표계 단위라 그 자체로는 의미가 없다. 실제 길이를
 * 알아야 배율이 나온다. 목록은 현장에서 실제로 눈에 띄는 것들이다([[reference-object]]) —
 * 인쇄한 마커를 전제하지 않는다(현장에 프린터가 없다).
 */
export function ReferenceObjectPicker({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (object: ReferenceObject) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>방금 잰 물건이 무엇인가요?</Text>
          <Text style={styles.subtitle}>
            실제 크기를 알아야 건물의 실제 부피를 계산할 수 있어요.
          </Text>

          <ScrollView style={styles.list}>
            {REFERENCE_OBJECTS.map((object) => (
              <Pressable
                key={object.id}
                style={styles.item}
                onPress={() => onSelect(object)}
                accessibilityRole="button"
              >
                <Text style={styles.itemLabel}>{object.label}</Text>
                <Text style={styles.itemHint}>
                  {object.hint} · {Math.round(object.lengthM * 1000)}mm
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelLabel}>취소</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '80%',
    padding: spacing.md,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs },
  list: { marginTop: spacing.md },
  item: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  itemLabel: { color: colors.text, fontSize: font.bodyLarge, fontWeight: '700' },
  itemHint: { color: colors.textMuted, fontSize: font.body, marginTop: 2 },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
  },
  cancelLabel: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
});
