import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ServiceRequest } from '@dimol/shared';
import type { RequestPersistence } from './store.js';

/**
 * JSON 파일 영속화 (파일럿 단계 — 서버 재시작에도 요청 데이터 유지).
 * 프론트(안티그래비티) 연동 개발 중 tsx watch 재시작으로 데이터가 날아가지 않게 한다.
 * PostgreSQL 연동 시 이 어댑터를 DB 구현으로 교체한다.
 *
 * 쓰기는 임시 파일 + rename 으로 원자적으로 처리해 중단 시 파일 깨짐을 방지한다.
 * 요청 데이터에 주소가 포함되므로 파일은 저장소에 커밋하지 않는다 (.gitignore `.data/`).
 */
export class JsonFilePersistence implements RequestPersistence {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'requests.json');
  }

  load(): ServiceRequest[] {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ServiceRequest[]) : [];
    } catch {
      // 파일 없음(최초 기동) 또는 손상 — 빈 상태로 시작.
      return [];
    }
  }

  save(requests: ServiceRequest[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(requests, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }
}
