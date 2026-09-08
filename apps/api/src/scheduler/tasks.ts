import { calculateSettlementDate } from '../settlement/settlement-date.js';
import type { ScheduledTask } from './index.js';
import type { AllbaroClient } from '../allbaro/client.js';
import { processRetryQueue, getDefaultRetryQueue } from '../allbaro/manifest-service.js';
import type { RetryQueueItem } from '../allbaro/retry-queue.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 실제 주기 작업들.
 *
 * 두 작업의 성격이 다르다는 점이 설계를 가른다:
 * - 재시도는 **이미 실패한 것을 다시 보낼 뿐**이라 자동화해도 새로 생기는 위험이 없다.
 * - 정산은 **돈이 나간다.** 자동 송금은 잘못되면 되돌리기 어렵고, CLAUDE.md 도
 *   결제/정산은 샌드박스 검증 후 운영 전환하라고 못 박는다. 그래서 여기서는
 *   "오늘 정산해야 할 건"을 **찾아서 알리기만** 한다. 실제 지급은 운영자가 실행한다.
 */

/** 재시도 처리 주기. 올바로 장애는 보통 분 단위로 풀리므로 5분이면 충분하다. */
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** 정산 대상 점검 주기. 하루 한 번이면 되지만, 재시작이 잦아 1시간마다 본다. */
export const SETTLEMENT_INTERVAL_MS = 60 * 60 * 1000;

export interface RetryTaskDeps {
  client: AllbaroClient;
  onExhausted?: (item: RetryQueueItem) => void;
}

/**
 * 올바로 재시도 큐 처리.
 *
 * 이게 없으면 발행 실패 건이 큐에 영원히 쌓인다 — 관리자가 매일 손으로 눌러야 하는데,
 * 안 누르면 법정 미신고다. 큐가 비어 있으면 올바로를 부르지 않는다(무의미한 호출 방지).
 */
export function createRetryTask(deps: RetryTaskDeps): ScheduledTask {
  return {
    name: 'allbaro-retry',
    intervalMs: RETRY_INTERVAL_MS,
    async run() {
      const queue = getDefaultRetryQueue();
      if (queue.due(Date.now()).length === 0) return;
      const summary = await processRetryQueue(deps.client, queue, {
        onExhausted: deps.onExhausted,
      });
      // 건수만 남긴다 — 큐 항목에는 사업자번호(PII)가 들어 있다.
      console.info(
        `[scheduler] 올바로 재시도 처리: 성공 ${summary.succeeded} · 재적재 ${summary.requeued} · 소진 ${summary.exhausted}`,
      );
    },
  };
}

/** 'YYYY-MM-DD' (KST 기준). 정산일 계산이 KST 날짜를 쓰므로 여기서도 맞춘다. */
export function kstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface SettlementTaskDeps {
  requestStore: RequestStore;
  holidays?: ReadonlySet<string>;
  now?: () => Date;
  /** 정산 대상을 알린다. 기본은 로그 — 실제 지급은 운영자가 실행한다. */
  notify?: (due: DueSettlement[]) => void;
}

export interface DueSettlement {
  matchRequestId: string;
  completedDate: string;
  settlementDate: string;
  agreedFee: number;
}

/**
 * 정산일이 된 처리완료(COMPLETED) 건을 찾는다.
 *
 * ⚠️ **지급을 실행하지 않는다.** 돈이 나가는 동작이라 사람의 실행을 남겨둔다
 * (CLAUDE.md: PG 는 테스트 모드 검증 후 운영 전환). 자동 송금으로 바꾸려면
 * 포트원 가맹·지급대행 계약과 실거래 대사 검증이 먼저다.
 */
export function createSettlementTask(deps: SettlementTaskDeps): ScheduledTask {
  const now = deps.now ?? (() => new Date());
  const notify =
    deps.notify ??
    ((due: DueSettlement[]) => {
      // 금액·건수만 남긴다. 사업자번호·계좌는 찍지 않는다.
      console.warn(
        `[scheduler] 정산 대상 ${due.length}건 (실행 대기) — ${due.map((d) => d.matchRequestId).join(', ')}`,
      );
    });

  return {
    name: 'settlement-due',
    intervalMs: SETTLEMENT_INTERVAL_MS,
    async run() {
      const today = kstDate(now());
      const completed = await deps.requestStore.list({ status: 'COMPLETED' });
      const due: DueSettlement[] = [];
      for (const request of completed) {
        const agreedFee = request.agreedFee ?? 0;
        // 합의 금액이 없으면 정산할 것이 없다 — 알려봐야 운영자가 할 일이 없다.
        if (agreedFee <= 0) continue;
        const completedDate = kstDate(new Date(request.updatedAt));
        const settlementDate = calculateSettlementDate(completedDate, deps.holidays);
        if (settlementDate <= today) {
          due.push({ matchRequestId: request.id, completedDate, settlementDate, agreedFee });
        }
      }
      if (due.length > 0) notify(due);
    },
  };
}
