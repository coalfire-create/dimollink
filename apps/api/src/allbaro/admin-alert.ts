import type { RetryQueueItem } from './retry-queue.js';

/**
 * 올바로 발행 실패(재시도 소진) 관리자 알림 어댑터 (로드맵 Phase 6).
 * 콘솔 목으로 시작 — 운영 채널(관리자 알림톡/슬랙/이메일) 계약 후 구현체만 교체한다.
 *
 * ⚠️ 큐 항목에는 사업자번호(PII)가 있으므로 알림에는 안전 필드만 담는다.
 * ⚠️ CLAUDE.md「사람이 반드시 직접 diff를 검토해야 하는 영역」— 올바로 API 연동.
 */
export interface AllbaroAdminAlerter {
  notifyExhausted(item: RetryQueueItem): void;
}

/** 콘솔 목 — matchRequestId/시도횟수/사유만 출력 (PII 미포함). */
export class ConsoleAllbaroAdminAlerter implements AllbaroAdminAlerter {
  notifyExhausted(item: RetryQueueItem): void {
    console.error(
      `[allbaro][ADMIN] 전자인계서 재시도 소진 — 수동 재처리 필요: ` +
        `queueId=${item.id}, match=${item.request.matchRequestId}, ` +
        `attempts=${item.attempts}/${item.maxAttempts}, lastError=${item.lastError ?? 'UNKNOWN'}`,
    );
  }
}
