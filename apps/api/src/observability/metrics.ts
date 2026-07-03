import type { NextFunction, Request, Response } from 'express';

/**
 * 경량 메트릭 수집(외부 의존성 없음) — Prometheus 텍스트 노출 형식.
 * HTTP 요청 수(메서드·상태등급별), 오류 수, 요청 지연(합/개수)을 집계한다.
 * 라벨 카디널리티 폭증을 막으려 경로가 아닌 상태등급(2xx/4xx/5xx)만 집계한다.
 */
export class Metrics {
  private readonly requests = new Map<string, number>();
  private durationSum = 0;
  private durationCount = 0;
  private readonly startedAt = Date.now();

  observe(method: string, statusCode: number, durationMs: number): void {
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const key = `${method}|${statusClass}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    this.durationSum += durationMs;
    this.durationCount += 1;
  }

  /** Prometheus 텍스트 노출. */
  render(): string {
    const lines: string[] = [];
    lines.push('# HELP http_requests_total 처리한 HTTP 요청 수');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of this.requests) {
      const [method, statusClass] = key.split('|');
      lines.push(`http_requests_total{method="${method}",status="${statusClass}"} ${value}`);
    }
    lines.push('# HELP http_request_duration_ms 요청 처리 지연(ms) 합/개수');
    lines.push('# TYPE http_request_duration_ms summary');
    lines.push(`http_request_duration_ms_sum ${this.durationSum}`);
    lines.push(`http_request_duration_ms_count ${this.durationCount}`);
    lines.push('# HELP process_uptime_seconds 프로세스 가동 시간(초)');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`);
    return lines.join('\n') + '\n';
  }
}

/** 응답 종료 시 메트릭을 기록하는 미들웨어. */
export function metricsMiddleware(metrics: Metrics) {
  return function collectMetrics(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      metrics.observe(req.method, res.statusCode, Date.now() - start);
    });
    next();
  };
}
