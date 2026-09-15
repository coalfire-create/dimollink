import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import {
  BUILDING_TYPE_LABELS,
  DEMOLITION_TYPE_LABELS,
  type BuildingType,
  type DemolitionType,
} from '@dimol/shared';
import { AddressPickerField } from '../../components/AddressPickerField';
import { Field } from '../../components/ui';
import { ChipSegment } from '../../components/form/ChipSegment';
import { FormSectionLabel } from '../../components/form/FormSectionLabel';
import { SegmentedToggle } from '../../components/form/SegmentedToggle';
import { YesNoRow } from '../../components/form/YesNoRow';
import { theme } from '../../theme';
import { BuildingLedgerCard } from './BuildingLedgerCard';
import { VisionPanel } from './VisionPanel';
import type { AreaUnit, RequestFormState } from './useRequestForm';

/**
 * 철거 요청 전용 입력 — 주소 → 건물 사실 확인 → 규모·조건 → 일정 → 사진 분석.
 *
 * 순서가 곧 안내다: 주소를 먼저 받아야 건축물대장을 붙일 수 있고, 대장이 있어야
 * 면적·층수·승강기가 자동으로 채워진다. 사용자가 손으로 채울 칸을 줄이는 게 목적이다.
 */
const BUILDING_TYPES: BuildingType[] = [
  'COMMERCIAL',
  'APARTMENT',
  'HOUSING',
  'OFFICE',
  'FACTORY',
  'OTHER',
];

const DEMOLITION_TYPES: DemolitionType[] = ['TOTAL', 'INTERIOR', 'STRUCTURE'];

const AREA_UNITS: Array<{ value: AreaUnit; label: string }> = [
  { value: 'PYEONG', label: '평' },
  { value: 'M2', label: '㎡' },
];

export function DemolitionSection({ form }: { form: RequestFormState }) {
  const { fieldErrors, areaUnit } = form;

  return (
    <>
      <AddressPickerField
        label="현장 주소"
        value={form.siteAddress}
        onChangeAddress={form.setSiteAddressPicked}
        placeholder="예) ○○시 ○○구 ○○동 12-3"
        hint="주소를 검색하거나 지도를 움직여 현장 위치를 정확히 맞춰주세요."
        error={fieldErrors.siteAddress}
      />

      <BuildingLedgerCard state={form.ledgerState} info={form.building} />

      <ChipSegment
        label="건물 / 공간 종류"
        options={BUILDING_TYPES.map((value) => ({ value, label: BUILDING_TYPE_LABELS[value] }))}
        value={form.buildingType}
        onChange={form.setBuildingType}
      />

      <ChipSegment
        label="철거 종류"
        options={DEMOLITION_TYPES.map((value) => ({ value, label: DEMOLITION_TYPE_LABELS[value] }))}
        value={form.demolitionType}
        onChange={form.setDemolitionType}
      />

      <FormSectionLabel>건물 면적</FormSectionLabel>
      <SegmentedToggle options={AREA_UNITS} value={areaUnit} onChange={form.setAreaUnit} />
      <Field
        label={areaUnit === 'PYEONG' ? '한 층 바닥면적 (평)' : '한 층 바닥면적 (㎡)'}
        value={form.spaceSize}
        onChangeText={(v) => {
          form.setSpaceSize(v);
          form.clearFieldError('spaceSize');
        }}
        placeholder={areaUnit === 'PYEONG' ? '예) 30' : '예) 99'}
        keyboardType="numeric"
        error={fieldErrors.spaceSize}
      />

      <Field
        label="현장 층수"
        value={form.floorCount}
        onChangeText={(v) => {
          form.setFloorCount(v);
          form.clearFieldError('floorCount');
        }}
        placeholder="예) 지상 3층 / 지하 1층"
        error={fieldErrors.floorCount}
      />

      <FormSectionLabel>현장 진입 조건</FormSectionLabel>
      <YesNoRow label="엘리베이터" value={form.hasElevator} onChange={form.setHasElevator} />
      <YesNoRow
        label="차량/사다리차 진입"
        value={form.hasVehicleAccess}
        onChange={form.setHasVehicleAccess}
        yesLabel="가능"
        noLabel="불가"
      />

      <FormSectionLabel>희망 일정 (다중 선택 가능)</FormSectionLabel>
      <View style={styles.calendarWrap}>
        <Calendar
          // 기본 형식('MMMM yyyy')이면 "9월 2026" 으로 나온다.
          monthFormat="yyyy년 M월"
          onDayPress={(day: { dateString: string }) => {
            // 같은 날을 다시 누르면 선택 해제 — 달력에서 날짜를 빼는 다른 방법이 없다.
            const next = { ...form.selectedDates };
            if (next[day.dateString]) delete next[day.dateString];
            else next[day.dateString] = { selected: true, selectedColor: theme.colors.primary };
            form.setSelectedDates(next);
          }}
          markedDates={form.selectedDates}
          theme={{
            arrowColor: theme.colors.primary,
            todayTextColor: theme.colors.primary,
            selectedDayBackgroundColor: theme.colors.primary,
          }}
        />
      </View>

      <VisionPanel form={form} />

      <Field
        label="상세 요구사항"
        value={form.description}
        onChangeText={form.setDescription}
        placeholder="예) 주방·욕실 포함 전체 철거, 바닥 샌딩 포함, 야간 작업 가능 여부"
        multiline
        style={styles.multilineInput}
      />
    </>
  );
}

const styles = StyleSheet.create({
  calendarWrap: {
    marginBottom: theme.spacing.md,
  },
  multilineInput: {
    minHeight: 80,
  },
});
