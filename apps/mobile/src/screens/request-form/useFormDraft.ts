import { useEffect, useRef } from 'react';
import type { RequestKind } from '@dimol/shared';
import { clearDraft, loadDraft, saveDraft, type RequestDraftValues } from '../../lib/request-draft';

/**
 * 폼 초안의 "언제" — 언제 불러오고, 언제 저장하고, 언제 지우는지.
 *
 * "무엇을" 복원할지는 호출부가 정한다(onRestore). 어떤 칸이 이미 채워져 있는지,
 * 링크 프리필이 우선인지는 폼만 알기 때문이다. 이 훅은 타이밍만 책임진다.
 */
export function useFormDraft({
  kind,
  values,
  enabled,
  onRestore,
}: {
  kind: RequestKind;
  /** 지금 폼에 적힌 값들. 바뀌면 디바운스 후 저장된다. */
  values: RequestDraftValues;
  /** 접수가 끝났으면 false — 더 저장할 이유가 없다. */
  enabled: boolean;
  /** 저장돼 있던 초안. 무엇을 되살릴지는 호출부가 고른다. */
  onRestore: (draft: RequestDraftValues) => void;
}) {
  const restoredRef = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  // 복원은 마운트 시 1회 — 값이 바뀔 때마다 다시 복원하면 사용자가 지운 칸이 되살아난다.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void (async () => {
      const draft = await loadDraft(kind);
      if (draft) restoreRef.current(draft);
    })();
  }, [kind]);

  /**
   * 자동 저장 — 입력이 멈추고 0.8초 뒤에 한 번.
   * 글자마다 저장하면 저장소를 계속 두드려 입력이 끊긴다.
   * 값 비교는 문자열로 한다(객체는 매 렌더 새로 만들어져 의존성이 늘 바뀐다).
   */
  const signature = JSON.stringify(values);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void saveDraft(kind, JSON.parse(signature) as RequestDraftValues);
    }, 800);
    return () => clearTimeout(timer);
  }, [kind, signature, enabled]);

  return {
    /** 접수 완료 — 초안을 버린다. */
    discard: () => void clearDraft(kind),
  };
}
