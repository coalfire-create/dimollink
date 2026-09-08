import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import {
  adminListAnomalies,
  adminListIncidents,
  adminResolveIncident,
  type AdminAnomaly,
  type AdminIncident,
} from '../../api/client';
import { AppButton, Card, Field, SectionTitle } from '../../components/ui';
import { Empty, Hint, adminStyles as s, errorMessage, useAdminList } from './shared';
import type { AdminTabProps } from './shared';

/** 노쇼·분쟁 조정 + 이상거래 탐지 결과. 조치 여부는 사람이 판단한다. */
export function IncidentsTab({ token, onError }: AdminTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadIncidents = useCallback(() => adminListIncidents(token, 'OPEN'), [token]);
  const loadAnomalies = useCallback(() => adminListAnomalies(token), [token]);
  const incidents = useAdminList<AdminIncident>(loadIncidents, onError, '분쟁 조회에 실패했습니다.');
  const anomalies = useAdminList<AdminAnomaly>(loadAnomalies, onError, '이상거래 조회에 실패했습니다.');

  async function resolve(incident: AdminIncident) {
    const note = (notes[incident.id] ?? '').trim();
    if (!note) {
      onError('처리 내용을 입력해 주세요.');
      return;
    }
    setBusyId(incident.id);
    try {
      await adminResolveIncident(token, incident.id, note);
      incidents.setItems((prev) => prev.filter((i) => i.id !== incident.id));
    } catch (err) {
      onError(errorMessage(err, '분쟁 처리에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SectionTitle>미처리 분쟁 ({incidents.items.length})</SectionTitle>
      {incidents.items.length === 0 ? (
        <Empty>미처리 분쟁이 없어요.</Empty>
      ) : (
        incidents.items.map((inc) => (
          <Card key={inc.id}>
            <Text style={s.name}>{inc.kind}</Text>
            <Text style={s.meta}>{inc.note ?? '내용 없음'}</Text>
            <Field
              label="처리 내용 (필수)"
              value={notes[inc.id] ?? ''}
              onChangeText={(v) => setNotes((prev) => ({ ...prev, [inc.id]: v }))}
              placeholder="예) 양측 합의, 위약금 면제"
            />
            <AppButton
              label="처리 완료"
              onPress={() => void resolve(inc)}
              loading={busyId === inc.id}
            />
          </Card>
        ))
      )}

      <SectionTitle>이상거래 탐지 ({anomalies.items.length})</SectionTitle>
      <Hint>룰 기반 탐지 결과입니다. 조치 여부는 사람이 판단합니다.</Hint>
      {anomalies.items.length === 0 ? (
        <Empty>탐지된 이상 패턴이 없어요.</Empty>
      ) : (
        anomalies.items.map((a, i) => (
          <Card key={`${a.kind}-${i}`}>
            <Text style={s.name}>{a.kind}</Text>
            <Text style={s.meta}>{a.message}</Text>
          </Card>
        ))
      )}
    </>
  );
}
