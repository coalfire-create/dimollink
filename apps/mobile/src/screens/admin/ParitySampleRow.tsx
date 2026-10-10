import React, { useState } from 'react';
import { Text } from 'react-native';
import { BUILDING_STRUCTURE_LABELS, type ParitySample, type ParitySiteResult } from '@dimol/shared';
import { adminDeleteParitySample, adminSetParityActualTon } from '../../api/client';
import { AppButton, Card, Field } from '../../components/ui';
import { theme } from '../../theme';
import { adminStyles as s, confirmThen, errorMessage } from './shared';

/** 비율 → '12.3%'. signed 면 부호를 붙인다(+면 원격이 비쌈). 값이 없으면 '—'. */
export function formatRatio(ratio: number | null | undefined, signed = false): string {
  if (ratio === null || ratio === undefined) return '—';
  const text = `${Math.round(Math.abs(ratio) * 1000) / 10}%`;
  if (!signed || ratio === 0) return text;
  return ratio > 0 ? `+${text}` : `−${text}`;
}

const won = (amount: number) => `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만원`;

/**
 * 표본 한 줄 — 원격·방문 금액, 차이, 실적 톤 입력, 삭제.
 * 실적 톤은 철거가 끝난 뒤(올바로 처리 실적·계량표) 나중에 채운다.
 */
export function ParitySampleRow({
  token,
  sample,
  site,
  onChanged,
  onError,
}: {
  token: string;
  sample: ParitySample;
  site: ParitySiteResult | undefined;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [ton, setTon] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveTon() {
    const value = Number(ton.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      onError('실적 톤수는 0보다 큰 숫자로 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await adminSetParityActualTon(token, sample.id, value);
      setTon('');
      onChanged();
    } catch (err) {
      onError(errorMessage(err, '실적 톤 저장에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    confirmThen('표본 삭제', '이 표본을 지울까요? 되돌릴 수 없습니다.', () => {
      void adminDeleteParitySample(token, sample.id)
        .then(onChanged)
        .catch((err: unknown) => onError(errorMessage(err, '삭제에 실패했습니다.')));
    });
  }

  const facts = [
    sample.source === 'AUTO' ? '플랫폼 견적' : '직원 입력',
    sample.structure ? BUILDING_STRUCTURE_LABELS[sample.structure] : null,
    sample.floorAreaM2 ? `${sample.floorAreaM2}㎡` : null,
  ].filter(Boolean);

  return (
    <Card>
      <Text style={s.name} numberOfLines={1}>
        {sample.requestId.slice(0, 24)}
      </Text>
      <Text style={s.meta}>{facts.join(' · ')}</Text>
      <Text style={s.meta}>원격 {sample.remoteFinalAmounts.map(won).join(', ')}</Text>
      <Text style={s.meta}>방문 {sample.inPersonFinalAmounts.map(won).join(', ')}</Text>
      {site ? (
        <Text style={site.withinTarget ? s.name : s.warn}>
          차이 {formatRatio(site.diffRatio, true)}
          {site.withinTarget ? ' · 목표 안' : ' · 목표 밖'}
          {site.inPersonSpreadRatio !== null
            ? ` · 방문끼리 ${formatRatio(site.inPersonSpreadRatio)}`
            : ''}
        </Text>
      ) : (
        <Text style={s.warn}>금액이 비어 비교하지 못했습니다.</Text>
      )}
      <Text style={s.meta}>
        톤 — 추정 {sample.estimatedTon ?? '—'} · 실적 {sample.actualTon ?? '미입력'}
        {site?.tonErrorRatio != null ? ` (오차 ${formatRatio(site.tonErrorRatio, true)})` : ''}
      </Text>
      <Field
        label="실적 톤 입력"
        value={ton}
        onChangeText={setTon}
        keyboardType="decimal-pad"
        placeholder="예: 185.4"
      />
      <AppButton label="실적 톤 저장" variant="outline" onPress={() => void saveTon()} loading={busy} />
      <AppButton label="표본 삭제" variant="danger" onPress={remove} style={{ marginTop: theme.spacing.xs }} />
    </Card>
  );
}
