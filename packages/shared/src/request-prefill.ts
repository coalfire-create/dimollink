import { VISION_MATERIAL_TAXONOMY_V1, type VisionMaterialCode } from './vision-taxonomy.js';
import type { WasteItem } from './request.js';

/**
 * 요청 폼 프리필을 **URL 로 실어 나르는** 형식.
 *
 * 디몰비전(별도 배포된 정적 사이트)이 분석 결과를 디몰링크 앱으로 넘길 때 쓴다.
 * 두 서비스는 서로 다른 오리진이고 디몰비전 쪽은 로그인이 없어서, 공유 저장소나
 * 세션을 거칠 수 없다 — 링크 하나로 넘기는 것이 유일하게 단순한 방법이다.
 *
 * ⚠️ **이 값은 URL 에서 오므로 신뢰할 수 없다.** 사용자가 검토·수정한 뒤 제출하는
 * 폼을 채울 뿐이라 권한을 주지는 않지만, 그래도 화이트리스트로만 받는다:
 * 모르는 필드는 버리고, 자재 코드는 분류표에 있는 것만, 숫자는 상한을 건다.
 * 실패하면 예외 대신 null 을 돌려준다 — 링크가 깨졌다고 앱이 죽으면 안 된다.
 *
 * base64 를 쓰지 않는 이유: 플랫폼마다 atob/btoa 유무가 달라 조용히 깨진다.
 * percent-encoding 은 어디서나 같고 눈으로 읽을 수 있어 디버깅이 쉽다.
 */

/** 프리필을 싣는 쿼리 파라미터 이름. */
export const REQUEST_PREFILL_PARAM = 'prefill';

/** 자재 분류 v1 이 12종이라 그 이상은 들어올 수 없다. */
export const MAX_PREFILL_WASTE_ITEMS = VISION_MATERIAL_TAXONOMY_V1.length;

/** 한 자재의 중량 상한(kg). 10만 톤 — 단일 철거 현장에서 나올 수 없는 값. */
export const MAX_PREFILL_KG = 100_000_000;

/** 문자열 필드 길이 상한. 주소가 제일 긴데 그래도 이보다 짧다. */
export const MAX_PREFILL_TEXT = 200;

/** URL 전체 길이가 브라우저 한계를 넘지 않게 하는 상한. */
export const MAX_PREFILL_ENCODED = 4000;

export interface RequestPrefillPayload {
  /** 자재별 예상 중량. 폼의 소재 항목을 그대로 채운다. */
  wasteItems: WasteItem[];
  siteAddress?: string;
  buildingType?: string;
  floorAreaM2?: number;
  floorCount?: number;
  /** 올바로 전자인계서 의무 대상 여부(디몰비전 판정). 폼의 체크박스 기본값. */
  allbaroRequired?: boolean;
}

const MATERIAL_CODES = new Set<string>(VISION_MATERIAL_TAXONOMY_V1.map((m) => m.code));

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_PREFILL_TEXT);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 양수 유한값만 통과. 상한을 넘으면 버린다(자르면 틀린 값이 그럴듯해 보인다). */
function cleanNumber(value: unknown, max: number): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) return undefined;
  return n;
}

/** 자재 항목 정제 — 분류표에 있는 코드 + 양수 kg 만 남긴다. */
export function cleanWasteItems(value: unknown): WasteItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: WasteItem[] = [];
  for (const raw of value) {
    if (items.length >= MAX_PREFILL_WASTE_ITEMS) break;
    if (!raw || typeof raw !== 'object') continue;
    const material = (raw as { material?: unknown }).material;
    if (typeof material !== 'string' || !MATERIAL_CODES.has(material)) continue;
    // 같은 자재가 두 번 오면 뒤엣것을 버린다 — 폼에서 중복 행이 생기면 합계가 틀어진다.
    if (seen.has(material)) continue;
    const kg = cleanNumber((raw as { kg?: unknown }).kg, MAX_PREFILL_KG);
    if (kg === undefined) continue;
    seen.add(material);
    items.push({ material: material as VisionMaterialCode, kg });
  }
  return items;
}

/** 프리필 → URL 파라미터 값. */
export function encodeRequestPrefill(payload: RequestPrefillPayload): string {
  // 화이트리스트로 다시 짜서 내보낸다 — 호출부가 무엇을 넘기든 형식이 고정된다.
  const compact: Record<string, unknown> = { wasteItems: cleanWasteItems(payload.wasteItems) };
  const siteAddress = cleanText(payload.siteAddress);
  const buildingType = cleanText(payload.buildingType);
  const floorAreaM2 = cleanNumber(payload.floorAreaM2, 1_000_000);
  const floorCount = cleanNumber(payload.floorCount, 200);
  if (siteAddress) compact.siteAddress = siteAddress;
  if (buildingType) compact.buildingType = buildingType;
  if (floorAreaM2 !== undefined) compact.floorAreaM2 = floorAreaM2;
  if (floorCount !== undefined) compact.floorCount = floorCount;
  if (payload.allbaroRequired === true) compact.allbaroRequired = true;
  return encodeURIComponent(JSON.stringify(compact));
}

/**
 * URL 파라미터 값 → 프리필. 형식이 조금이라도 어긋나면 null.
 * 자재가 하나도 안 남으면 프리필할 게 없다는 뜻이라 역시 null 이다.
 */
export function decodeRequestPrefill(raw: string | null | undefined): RequestPrefillPayload | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PREFILL_ENCODED) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null; // 깨진 링크로 앱이 죽으면 안 된다.
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const source = parsed as Record<string, unknown>;
  const wasteItems = cleanWasteItems(source.wasteItems);
  if (wasteItems.length === 0) return null;

  const payload: RequestPrefillPayload = { wasteItems };
  const siteAddress = cleanText(source.siteAddress);
  const buildingType = cleanText(source.buildingType);
  const floorAreaM2 = cleanNumber(source.floorAreaM2, 1_000_000);
  const floorCount = cleanNumber(source.floorCount, 200);
  if (siteAddress) payload.siteAddress = siteAddress;
  if (buildingType) payload.buildingType = buildingType;
  if (floorAreaM2 !== undefined) payload.floorAreaM2 = floorAreaM2;
  if (floorCount !== undefined) payload.floorCount = floorCount;
  if (source.allbaroRequired === true) payload.allbaroRequired = true;
  return payload;
}

/**
 * URL 에서 프리필을 꺼낸다. 웹 주소(`?prefill=`)와 딥링크(`dimollink://request?prefill=`)를
 * 모두 받는다 — 앱은 딥링크로, 웹앱은 주소창으로 들어온다.
 */
export function parsePrefillFromUrl(url: string | null | undefined): RequestPrefillPayload | null {
  if (typeof url !== 'string') return null;
  // URL 파서를 쓰지 않는다 — 커스텀 스킴(dimollink://)은 환경마다 파싱이 다르다.
  const match = new RegExp(`[?&]${REQUEST_PREFILL_PARAM}=([^&#]*)`).exec(url);
  return match ? decodeRequestPrefill(match[1]) : null;
}
