import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  validateManualParityInput,
  type BuildingStructure,
} from '@dimol/shared';
import { adminAddParitySample } from '../../api/client';
import { AppButton, Card, Field } from '../../components/ui';
import { theme } from '../../theme';
import { adminStyles as s, errorMessage } from './shared';

/**
 * 시범 현장 직원 입력 폼.
 *
 * 금액은 원 단위로, 여러 개면 띄어쓰기나 / 로 나눈다. 쉼표는 천 단위 표기로 보고 지운다
 * (쉼표를 구분자로 쓰면 "10,000,000" 이 세 개의 금액이 된다).
 * 검증은 서버와 같은 함수를 써서, 화면에서 통과한 입력이 서버에서 막히지 않게 한다.
 */

const STRUCTURES = Object.keys(BUILDING_STRUCTURE_LABELS) as BuildingStructure[];

function parseAmounts(text: string): number[] {
  return text
    .replace(/,/g, '')
    .split(/[\s/]+/)
    .filter((t) => t.length > 0)
    .map(Number);
}

const EMPTY = { requestId: '', remote: '', inPerson: '', floorArea: '', actualTon: '', note: '' };

export function ParityManualForm({
  token,
  onSaved,
  onError,
}: {
  token: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [structure, setStructure] = useState<BuildingStructure | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const input = validateManualParityInput({
      requestId: form.requestId,
      remoteFinalAmounts: parseAmounts(form.remote),
      inPersonFinalAmounts: parseAmounts(form.inPerson),
      structure,
      floorAreaM2: form.floorArea.replace(/,/g, ''),
      actualTon: form.actualTon.replace(/,/g, ''),
      note: form.note,
    });
    if (typeof input === 'string') {
      setError(input);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await adminAddParitySample(token, input);
      setForm(EMPTY);
      setStructure(undefined);
      onSaved();
    } catch (err) {
      onError(errorMessage(err, '표본 저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Field
        label="요청 id 또는 현장 이름"
        required
        value={form.requestId}
        onChangeText={set('requestId')}
        placeholder="예: 시범-01 양평 단독주택"
      />
      <Field
        label="원격 확정 금액(원)"
        required
        hint="여러 개면 띄어쓰기로 나눠 주세요."
        value={form.remote}
        onChangeText={set('remote')}
        keyboardType="numbers-and-punctuation"
        placeholder="예: 12000000"
      />
      <Field
        label="방문 확정 금액(원)"
        required
        hint="방문 업체 2곳 이상을 넣어야 업체끼리 차이를 잴 수 있어요."
        value={form.inPerson}
        onChangeText={set('inPerson')}
        keyboardType="numbers-and-punctuation"
        placeholder="예: 11500000 13000000"
        error={error}
      />
      <Text style={s.rowLabel}>구조(선택)</Text>
      <View style={s.chipRow}>
        {STRUCTURES.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: structure === code }}
            onPress={() => setStructure(structure === code ? undefined : code)}
            style={[s.chip, structure === code && { backgroundColor: theme.colors.primarySoft }]}
          >
            <Text style={s.chipLabel}>{BUILDING_STRUCTURE_LABELS[code]}</Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="연면적(㎡, 선택)"
        value={form.floorArea}
        onChangeText={set('floorArea')}
        keyboardType="decimal-pad"
      />
      <Field
        label="실적 톤(선택)"
        hint="철거 후 올바로 처리 실적이나 계량표를 보고 넣어요. 나중에 넣어도 됩니다."
        value={form.actualTon}
        onChangeText={set('actualTon')}
        keyboardType="decimal-pad"
      />
      <Field label="메모(선택)" value={form.note} onChangeText={set('note')} />
      <AppButton label="표본 저장" onPress={() => void submit()} loading={saving} />
    </Card>
  );
}
