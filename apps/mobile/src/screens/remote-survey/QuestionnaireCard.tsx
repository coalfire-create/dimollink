import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ACCESS_WIDTH_LABELS,
  REMOTE_SURVEY_MAX_FLOORS,
  REMOTE_SURVEY_ROOF_LABELS,
  REMOTE_SURVEY_TEXT_MAX,
  SURVEY_TRI_STATE_LABELS,
  isQuestionnaireDone,
  type AccessWidthBucket,
  type RemoteSurveyAnswers,
  type RemoteSurveyRoofType,
  type SurveyTriState,
} from '@dimol/shared';
import { AppButton, Card, Field } from '../../components/ui';
import { ChoiceRow } from './ChoiceRow';
import { ItemStatus } from './ItemStatus';
import { theme } from '../../theme';

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const TRI = options<SurveyTriState>(SURVEY_TRI_STATE_LABELS);
const ROOF = options<RemoteSurveyRoofType>(REMOTE_SURVEY_ROOF_LABELS);
const WIDTH = options<AccessWidthBucket>(ACCESS_WIDTH_LABELS);
const EMPTY = [
  { value: 'YES', label: '비어 있어요' },
  { value: 'NO', label: '짐·사람이 있어요' },
] as const;

/**
 * 질문 — 사진으로는 알 수 없는 것(지하·석면·층수·비어 있는지·길 폭).
 * 고른 답은 화면에만 두었다가 "답 저장하기"로 한 번에 저장한다(누를 때마다 저장하면
 * 느린 망에서 버튼이 계속 막힌다).
 */
export function QuestionnaireCard({
  answers,
  busy,
  onSave,
}: {
  answers: RemoteSurveyAnswers;
  busy: boolean;
  onSave: (answers: RemoteSurveyAnswers) => void;
}) {
  const [draft, setDraft] = useState<RemoteSurveyAnswers>(answers);
  useEffect(() => setDraft(answers), [answers]);
  const set = (patch: Partial<RemoteSurveyAnswers>) => setDraft((d) => ({ ...d, ...patch }));
  const floors = draft.floorsAboveGround;
  const dirty = JSON.stringify(draft) !== JSON.stringify(answers);

  return (
    <Card>
      <ItemStatus title="질문 답하기" done={isQuestionnaireDone(answers)} required />

      <ChoiceRow
        question="지하층이 있나요?"
        options={TRI}
        value={draft.basement}
        onChange={(basement) => set({ basement })}
      />

      <View style={styles.block}>
        <Text style={styles.question}>땅 위로 몇 층인가요?</Text>
        <View style={styles.stepper}>
          <AppButton
            label="−"
            variant="outline"
            disabled={!floors || floors <= 1}
            onPress={() => set({ floorsAboveGround: Math.max(1, (floors ?? 1) - 1) })}
            style={styles.stepButton}
          />
          <Text style={styles.floors} accessibilityLiveRegion="polite">
            {floors ? `${floors}층` : '골라 주세요'}
          </Text>
          <AppButton
            label="+"
            variant="outline"
            disabled={(floors ?? 0) >= REMOTE_SURVEY_MAX_FLOORS}
            onPress={() =>
              set({ floorsAboveGround: Math.min(REMOTE_SURVEY_MAX_FLOORS, (floors ?? 0) + 1) })
            }
            style={styles.stepButton}
          />
        </View>
      </View>

      <ChoiceRow
        question="지붕은 무엇인가요?"
        options={ROOF}
        value={draft.roofType}
        onChange={(roofType) => set({ roofType })}
      />
      <ChoiceRow
        question="석면이 있다고 들은 적 있나요?"
        options={TRI}
        value={draft.knownAsbestos}
        onChange={(knownAsbestos) => set({ knownAsbestos })}
      />
      <ChoiceRow
        question="지금 건물이 비어 있나요?"
        options={EMPTY}
        value={draft.buildingEmpty === undefined ? undefined : draft.buildingEmpty ? 'YES' : 'NO'}
        onChange={(v) => set({ buildingEmpty: v === 'YES' })}
      />
      <ChoiceRow
        question="들어오는 길에서 가장 좁은 곳의 폭은?"
        options={WIDTH}
        value={draft.accessWidth}
        onChange={(accessWidth) => set({ accessWidth })}
      />

      <Field
        label="더 알려 줄 것(선택)"
        placeholder="예: 마당에 창고가 하나 더 있어요"
        value={draft.notes ?? ''}
        maxLength={REMOTE_SURVEY_TEXT_MAX}
        multiline
        onChangeText={(notes) => set({ notes })}
      />

      <AppButton
        label={dirty ? '답 저장하기' : '저장됨'}
        disabled={busy || !dirty}
        onPress={() => onSave(draft)}
      />
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.md,
  },
  question: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepButton: {
    minWidth: 64,
  },
  floors: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    minWidth: 96,
    textAlign: 'center',
  },
});
