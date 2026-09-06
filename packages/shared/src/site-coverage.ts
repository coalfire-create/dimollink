/**
 * 촬영 범위(coverage) 판정 — "무엇을 판정할 수 없는가"를 계산한다.
 *
 * 사진에 담기지 않은 부위를 모델이 추정으로 메우면 그럴듯한 오답이 나온다.
 * 그래서 어떤 슬롯이 빠졌는지로 **판정 불가 항목을 먼저 선언**하고, 그 사실을
 * 프롬프트(모델에게: 추정하지 말 것)와 리포트(사용자에게: 이건 확인 못 했음) 양쪽에 싣는다.
 *
 * [[site-capture-guide]] 의 슬롯 정의와 짝을 이룬다.
 */

import { SITE_CAPTURE_SLOTS, type SiteCaptureSlotId } from './site-capture-guide.js';

/** 슬롯이 없을 때 판정하지 못하는 것 — 사용자에게 그대로 노출하는 문구. */
const MISSING_SLOT_WARNINGS: Record<SiteCaptureSlotId, string> = {
  FRONT_WALL: '정면 사진이 없어 건물 전면 마감재를 판정하지 못했습니다.',
  RIGHT_WALL: '우측면 사진이 없어 해당 면의 마감재·부착물을 판정하지 못했습니다.',
  BACK_WALL: '후면 사진이 없어 해당 면의 마감재·부착물을 판정하지 못했습니다.',
  LEFT_WALL: '좌측면 사진이 없어 해당 면의 마감재·부착물을 판정하지 못했습니다.',
  FLOOR: '바닥 사진이 없어 바닥 마감재(장판·타일 등)를 판정하지 못했습니다.',
  CEILING:
    '천장 사진이 없어 천장재(텍스 등 석면 의심 자재 포함)를 판정하지 못했습니다. 석면 사전조사에서 반드시 확인하세요.',
  DAMAGE: '',
};

/**
 * 사진 장수만으로도 최소한의 경고는 해야 한다 — 가이드 촬영을 쓰지 않고
 * 몇 장만 올린 경우. 이 장수 미만이면 현장 전체 판정에 한계가 있다고 알린다.
 */
export const MIN_PHOTOS_FOR_FULL_SITE = 4;

/** 필수 슬롯(선택 슬롯 제외) 목록. */
export const REQUIRED_CAPTURE_SLOTS: readonly SiteCaptureSlotId[] = SITE_CAPTURE_SLOTS.filter(
  (s) => !s.optional,
).map((s) => s.id);

export interface CoverageInput {
  /** 분석에 들어간 사진 수. */
  photoCount: number;
  /** 가이드 촬영으로 확보한 슬롯들. 가이드 촬영을 쓰지 않았으면 비운다. */
  slotIds?: readonly (SiteCaptureSlotId | undefined)[];
}

/**
 * 촬영 범위로부터 결측 경고를 만든다.
 * 슬롯 정보가 있으면 빠진 슬롯별로, 없으면 장수 기준으로 경고한다.
 */
export function coverageWarnings(input: CoverageInput): string[] {
  const warnings: string[] = [];
  const present = new Set(
    (input.slotIds ?? []).filter((id): id is SiteCaptureSlotId => typeof id === 'string'),
  );

  if (present.size === 0) {
    // 가이드 촬영 정보 없음 — 장수로만 판단한다.
    if (input.photoCount > 0 && input.photoCount < MIN_PHOTOS_FOR_FULL_SITE) {
      warnings.push(
        `사진 ${input.photoCount}장만으로 분석했습니다. 촬영되지 않은 면·천장·바닥의 소재와 위험 요소는 판정되지 않았습니다.`,
      );
    }
    return warnings;
  }

  for (const slotId of REQUIRED_CAPTURE_SLOTS) {
    if (present.has(slotId)) continue;
    const warning = MISSING_SLOT_WARNINGS[slotId];
    if (warning) warnings.push(warning);
  }
  return warnings;
}

/** 품질 경고를 달고 온 사진 1장. */
export interface PhotoQualityInput {
  slotId?: SiteCaptureSlotId;
  /** 클라이언트가 촬영 시점에 판정한 미달 사유(밝기·대비·선명도). */
  qualityWarnings?: readonly string[];
}

/**
 * 사진별 품질 미달을 결측과 같은 급의 경고로 바꾼다.
 *
 * 흐리거나 어두운 사진은 "안 찍은 것"에 가깝다 — 그 사진에서 나온 판정은 근거가 약하다는
 * 사실을 모델과 사용자 양쪽에 명시한다.
 */
export function photoQualityWarnings(photos: readonly PhotoQualityInput[]): string[] {
  const warnings: string[] = [];
  photos.forEach((photo, i) => {
    const reasons = photo.qualityWarnings ?? [];
    if (reasons.length === 0) return;
    const where = photo.slotId ? `(${CAPTURE_SLOT_SHORT_LABEL[photo.slotId]})` : '';
    warnings.push(
      `사진 ${i + 1}${where}: ${reasons.join(', ')} — 이 사진에서 얻은 판정은 신뢰도가 낮습니다.`,
    );
  });
  return warnings;
}

/** 슬롯 → 프롬프트에 실을 짧은 부위명. */
export const CAPTURE_SLOT_SHORT_LABEL: Record<SiteCaptureSlotId, string> = {
  FRONT_WALL: '정면 벽',
  RIGHT_WALL: '우측 벽',
  BACK_WALL: '후면 벽',
  LEFT_WALL: '좌측 벽',
  FLOOR: '바닥',
  CEILING: '천장',
  DAMAGE: '손상부위 근접',
};
