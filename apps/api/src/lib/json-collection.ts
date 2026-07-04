import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 컬렉션 영속화 공통 인터페이스 (파일럿 단계).
 * 기본 구현은 JSON 파일, PostgreSQL 연동 시 DB 구현으로 교체한다.
 */
export interface CollectionPersistence<T> {
  load(): T[];
  save(items: T[]): void;
}

/**
 * 컬렉션 이름 → 영속화 어댑터 생성.
 * keyOf: 엔티티의 고유 키 추출자(PostgreSQL 행 단위 저장의 PK). 기본은 item.id.
 * 대부분 컬렉션은 `id` 를 쓰고, 결제는 `paymentId`, 세션은 `token` 을 넘긴다.
 */
export interface PersistenceFactory {
  <T>(name: string, keyOf?: (item: T) => string): CollectionPersistence<T>;
}

/** 기본 키 추출자 — item.id. */
export function defaultKeyOf<T>(item: T): string {
  return (item as { id?: unknown }).id as string;
}

/** JSON 파일 기반 영속화 팩토리(기본). `<name>.json` 파일에 저장한다(keyOf 무시). */
export function jsonPersistenceFactory(dataDir: string): PersistenceFactory {
  return <T>(name: string): CollectionPersistence<T> =>
    new JsonCollectionFile<T>(dataDir, `${name}.json`);
}

/**
 * JSON 파일 영속화 — 서버 재시작에도 데이터 유지 (프론트 연동 개발 편의).
 * 쓰기는 임시 파일 + rename 으로 원자적으로 처리해 중단 시 파일 깨짐을 방지한다.
 * PII 포함 가능 데이터이므로 저장 디렉토리(.data/)는 커밋하지 않는다 (.gitignore).
 */
export class JsonCollectionFile<T> implements CollectionPersistence<T> {
  private readonly filePath: string;

  constructor(dataDir: string, fileName: string) {
    this.filePath = join(dataDir, fileName);
  }

  load(): T[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      // 파일 없음(최초 기동) 또는 손상 — 빈 상태로 시작.
      return [];
    }
  }

  save(items: T[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(items, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
  }
}
