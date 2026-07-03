import { describe, expect, it } from 'vitest';
import { Metrics } from './metrics.js';

describe('Metrics', () => {
  it('요청을 메서드·상태등급으로 집계하고 Prometheus 텍스트로 노출', () => {
    const m = new Metrics();
    m.observe('GET', 200, 10);
    m.observe('GET', 201, 20); // 여전히 2xx
    m.observe('POST', 404, 5);
    m.observe('GET', 500, 30);

    const out = m.render();
    expect(out).toContain('http_requests_total{method="GET",status="2xx"} 2');
    expect(out).toContain('http_requests_total{method="POST",status="4xx"} 1');
    expect(out).toContain('http_requests_total{method="GET",status="5xx"} 1');
    expect(out).toContain('http_request_duration_ms_count 4');
    expect(out).toContain('http_request_duration_ms_sum 65');
    expect(out).toContain('process_uptime_seconds');
  });
});
