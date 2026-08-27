import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 컬렉션 영속화 공통 인터페이스 (Stateless 아키텍처용).
 * 서버 재시작 시 인메모리 캐시 대신 매 요청마다 DB에 질의합니다.
 */
export interface CollectionPersistence<T> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(item: T): Promise<void>;
  saveAll(items: T[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PersistenceFactory {
  <T>(name: string, keyOf?: (item: T) => string): CollectionPersistence<T>;
}

export function defaultKeyOf<T>(item: T): string {
  return (item as { id?: unknown }).id as string;
}

export function jsonPersistenceFactory(dataDir: string): PersistenceFactory {
  return <T>(name: string, keyOf: (item: T) => string = defaultKeyOf): CollectionPersistence<T> =>
    new JsonCollectionFile<T>(dataDir, `${name}.json`, keyOf);
}

export class JsonCollectionFile<T> implements CollectionPersistence<T> {
  private readonly filePath: string;

  constructor(
    dataDir: string, 
    fileName: string,
    private readonly keyOf: (item: T) => string
  ) {
    this.filePath = join(dataDir, fileName);
  }

  private async readAll(): Promise<T[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private async writeAll(items: T[]): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(items, null, 2), 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }

  async get(id: string): Promise<T | undefined> {
    const items = await this.readAll();
    return items.find((it) => this.keyOf(it) === id);
  }

  async list(): Promise<T[]> {
    return this.readAll();
  }

  async save(item: T): Promise<void> {
    const items = await this.readAll();
    const id = this.keyOf(item);
    const index = items.findIndex((it) => this.keyOf(it) === id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }
    await this.writeAll(items);
  }

  async saveAll(items: T[]): Promise<void> {
    const current = await this.readAll();
    const map = new Map(current.map(it => [this.keyOf(it), it]));
    for (const item of items) {
      map.set(this.keyOf(item), item);
    }
    await this.writeAll(Array.from(map.values()));
  }

  async delete(id: string): Promise<void> {
    const items = await this.readAll();
    const filtered = items.filter((it) => this.keyOf(it) !== id);
    await this.writeAll(filtered);
  }
}
