/**
 * 주기 작업 스케줄러.
 *
 * 왜 필요한가: 올바로 재시도 큐와 D+1 정산은 코드가 다 있는데 **아무도 부르지 않았다.**
 * 둘 다 관리자용 HTTP 엔드포인트로만 열려 있어서, 운영자가 매일 손으로 눌러야 돌아간다.
 * 안 누르면 각각 이렇게 된다:
 *  - 재시도 큐: 발행 실패한 전자인계서가 영원히 쌓인다 → 법정 미신고.
 *  - 정산: 익영업일(D+1)에 나가야 할 돈이 안 나간다 → 업체가 대금을 못 받는다.
 *
 * 설계:
 *  - **여러 인스턴스가 동시에 돌면 중복 실행된다.** 지금은 단일 인스턴스 전제다.
 *    여러 대로 늘리면 잠금(DB advisory lock 등)이 먼저 필요하고, 그 전까지는
 *    `SCHEDULER_ENABLED=false` 로 한 대만 켜는 식으로 운용한다.
 *  - 실행 중 예외는 삼킨다. 한 번 실패해도 다음 주기에 다시 시도해야 하고,
 *    여기서 던지면 프로세스가 죽는다.
 *  - 겹쳐 도는 것을 막는다(이전 실행이 안 끝났으면 이번 주기를 건너뛴다).
 *    올바로가 느릴 때 재시도가 중첩되면 같은 건을 두 번 발행할 수 있다.
 */

export interface ScheduledTask {
  name: string;
  intervalMs: number;
  run(): Promise<void>;
}

export interface SchedulerHandle {
  stop(): void;
  /** 테스트·운영 점검용 — 주기를 기다리지 않고 한 번 돌린다. */
  runNow(name: string): Promise<void>;
}

export function startScheduler(tasks: readonly ScheduledTask[]): SchedulerHandle {
  const timers: NodeJS.Timeout[] = [];
  const running = new Set<string>();

  async function invoke(task: ScheduledTask): Promise<void> {
    if (running.has(task.name)) return; // 이전 실행이 안 끝났다 — 중첩되면 같은 건을 두 번 처리한다.
    running.add(task.name);
    try {
      await task.run();
    } catch (err) {
      // 사유만 남긴다. 작업 내용에는 PII 가 섞일 수 있다.
      console.warn(`[scheduler] ${task.name} 실패`, err instanceof Error ? err.message : 'error');
    } finally {
      running.delete(task.name);
    }
  }

  for (const task of tasks) {
    const timer = setInterval(() => void invoke(task), task.intervalMs);
    // 프로세스 종료를 막지 않는다(배포 재시작·테스트가 걸리면 안 된다).
    timer.unref?.();
    timers.push(timer);
  }

  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
    },
    async runNow(name) {
      const task = tasks.find((t) => t.name === name);
      if (task) await invoke(task);
    },
  };
}
