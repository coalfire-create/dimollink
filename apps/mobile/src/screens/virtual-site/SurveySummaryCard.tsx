import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ACCESS_WIDTH_LABELS,
  REMOTE_SURVEY_ROOF_LABELS,
  SURVEY_TRI_STATE_LABELS,
  computeSurveyCompleteness,
  remoteSurveyItem,
  type RemoteSurvey,
} from '@dimol/shared';
import { Card, InfoRow, SectionTitle } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 원격 실사 자료 요약 — 얼마나 찼는가 + 질문지 답(사진으로 판단할 수 없는 것).
 * 완료율은 소비자 화면·서버 제출 판정과 같은 함수([[remote-survey]] computeSurveyCompleteness)로 낸다.
 */
export function SurveySummaryCard({ survey }: { survey: RemoteSurvey }) {
  const { doneRequired, totalRequired, missingRequired } = computeSurveyCompleteness(survey);
  const a = survey.answers;
  const rows: { label: string; value: string }[] = [];
  if (a.floorsAboveGround !== undefined) rows.push({ label: '지상 층수', value: `${a.floorsAboveGround}층` });
  if (a.basement) rows.push({ label: '지하', value: SURVEY_TRI_STATE_LABELS[a.basement] });
  if (a.roofType) rows.push({ label: '지붕', value: REMOTE_SURVEY_ROOF_LABELS[a.roofType] });
  if (a.knownAsbestos) {
    rows.push({ label: '석면 들은 적', value: SURVEY_TRI_STATE_LABELS[a.knownAsbestos] });
  }
  if (a.buildingEmpty !== undefined) {
    rows.push({ label: '건물 비어 있음', value: a.buildingEmpty ? '비어 있음' : '짐 있음' });
  }
  if (a.accessWidth) rows.push({ label: '들어오는 길', value: ACCESS_WIDTH_LABELS[a.accessWidth] });

  const missingNames = missingRequired.map((id) =>
    id === 'QUESTIONNAIRE' ? '질문 답' : (remoteSurveyItem(id)?.title ?? id),
  );

  return (
    <View>
      <SectionTitle>원격 실사 자료</SectionTitle>
      <Card>
        <Text style={styles.progress}>
          필수 {totalRequired}개 중 {doneRequired}개 받음
        </Text>
        {survey.submittedAt ? (
          <Text style={styles.hint}>
            {new Date(survey.submittedAt).toLocaleString('ko-KR')}에 받음
          </Text>
        ) : null}
        {missingNames.length > 0 ? (
          <Text style={styles.missing}>빠진 것: {missingNames.join(', ')}</Text>
        ) : null}
        {survey.scanJobId ? <Text style={styles.hint}>3D 스캔 포함 — 3D·물량 탭에서 보세요.</Text> : null}
      </Card>

      <SectionTitle>신청자 답변</SectionTitle>
      <Card>
        {rows.map((row) => (
          <InfoRow key={row.label} label={row.label} value={row.value} />
        ))}
        {a.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>메모</Text>
            <Text style={styles.notesText}>{a.notes}</Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  progress: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: font.body, lineHeight: 28, marginTop: spacing.xs },
  missing: { color: colors.error, fontSize: font.body, fontWeight: '700', marginTop: spacing.xs },
  notes: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  notesLabel: { color: colors.textMuted, fontSize: font.caption, fontWeight: '700' },
  notesText: { color: colors.text, fontSize: font.body, lineHeight: 28 },
});
