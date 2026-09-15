import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RequestKind } from '@dimol/shared';

/**
 * 요청 폼 임시 저장 — 작성 중 앱이 닫히거나 다른 화면으로 튕겨도 입력을 잃지 않게 한다.
 *
 * 철거 요청 폼은 주소·면적·층수·사진까지 한참 걸리는 작업이라, 전화가 와서 앱이
 * 내려가면 처음부터 다시 쓰게 된다. 실제로 그때 사용자는 그냥 포기한다.
 *
 * 저장 대상은 **다시 입력하기 번거로운 텍스트 값**뿐이다. 사진·분석 결과는 저장하지
 * 않는다(용량이 크고, 현장이 바뀌면 오히려 틀린 정보가 남는다).
 * 오래된 초안은 TTL 이 지나면 버린다 — 지난달 현장 정보가 되살아나면 더 위험하다.
 */

const KEY_PREFIX = 'dimol.requestDraft.';
/** 초안 보관 기간 — 하루 지나면 현장 상황이 달라져 있을 가능성이 높다. */
const TTL_MS = 24 * 60 * 60 * 1000;

export interface RequestDraft {
  region: string;
  siteAddress: string;
  spaceSize: string;
  floorCount: string;
  desiredDate: string;
  description: string;
  loadAddress: string;
  unloadAddress: string;
  visitAt: string;
  savedAt: number;
}

export type RequestDraftValues = Omit<RequestDraft, 'savedAt'>;

const key = (kind: RequestKind): string => `${KEY_PREFIX}${kind}`;

/** 비어 있는 초안(전부 공백)은 저장하지 않는다 — 폼을 열기만 해도 "임시저장됨"이 뜨면 시끄럽다. */
export function isEmptyDraft(values: RequestDraftValues): boolean {
  return Object.values(values).every((v) => v.trim().length === 0);
}

export async function saveDraft(kind: RequestKind, values: RequestDraftValues): Promise<void> {
  if (isEmptyDraft(values)) return;
  try {
    await AsyncStorage.setItem(key(kind), JSON.stringify({ ...values, savedAt: Date.now() }));
  } catch {
    // 저장 실패는 조용히 넘긴다 — 초안 저장 때문에 작성이 막히면 안 된다.
  }
}

export async function loadDraft(kind: RequestKind): Promise<RequestDraftValues | null> {
  try {
    const raw = await AsyncStorage.getItem(key(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RequestDraft>;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TTL_MS) {
      await clearDraft(kind);
      return null;
    }
    const values = parsed;
    return {
      region: values.region ?? '',
      siteAddress: values.siteAddress ?? '',
      spaceSize: values.spaceSize ?? '',
      floorCount: values.floorCount ?? '',
      desiredDate: values.desiredDate ?? '',
      description: values.description ?? '',
      loadAddress: values.loadAddress ?? '',
      unloadAddress: values.unloadAddress ?? '',
      visitAt: values.visitAt ?? '',
    };
  } catch {
    return null;
  }
}

export async function clearDraft(kind: RequestKind): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(kind));
  } catch {
    // 무시.
  }
}
