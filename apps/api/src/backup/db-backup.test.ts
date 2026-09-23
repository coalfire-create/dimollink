import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { BackupObject, BackupStorage } from './backup-storage.js';
import { backupDateOf, backupKey, expiredKeys, exportEntities, runDbBackup } from './db-backup.js';

/**
 * DB 백업.
 *
 * 백업은 "돌고 있다"고 믿다가 정작 복구할 때 비어 있는 것이 가장 흔한 실패라서,
 * 여기서 보는 것은 (1) 덤프에 모든 행이 빠짐없이 들어가는가, (2) 보관기간 정리가
 * 마지막 하나까지 지워버리지 않는가, (3) 업로드가 실패했는데 옛것을 지우지 않는가 다.
 */

/** collection+id 키셋 페이징을 흉내내는 가짜 풀. */
function fakePool(rows: Array<{ collection: string; id: string; data: unknown; updated_at: unknown }>) {
  let queries = 0;
  return {
    get queries() {
      return queries;
    },
    async query(_text: string, params?: unknown[]) {
      queries += 1;
      const [lastCollection, lastId] = (params ?? ['', '']) as [string, string];
      const after = rows
        .slice()
        .sort((a, b) => a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id))
        .filter((r) => r.collection > lastCollection || (r.collection === lastCollection && r.id > lastId));
      return { rows: after.slice(0, 500) as unknown as Array<Record<string, unknown>> };
    },
  };
}

function fakeStorage(initial: BackupObject[] = []) {
  const objects = new Map<string, BackupObject>(initial.map((o) => [o.key, o]));
  const bodies = new Map<string, Uint8Array>();
  return {
    objects,
    bodies,
    failPut: false,
    async put(key: string, body: Uint8Array) {
      if (this.failPut) throw new Error('업로드 실패');
      bodies.set(key, body);
      objects.set(key, { key, size: body.byteLength, lastModified: new Date() });
    },
    async list() {
      return [...objects.values()];
    },
    async remove(keys: readonly string[]) {
      for (const k of keys) {
        objects.delete(k);
        bodies.delete(k);
      }
    },
    async get(key: string) {
      const b = bodies.get(key);
      if (!b) throw new Error('없음');
      return b;
    },
  } satisfies BackupStorage & Record<string, unknown>;
}

const day = 24 * 60 * 60 * 1000;

describe('exportEntities', () => {
  it('모든 행을 NDJSON 한 줄씩으로 내보낸다', async () => {
    const pool = fakePool([
      { collection: 'users', id: 'u1', data: { name: '김소비' }, updated_at: new Date('2026-09-01T00:00:00Z') },
      { collection: 'requests', id: 'r1', data: { status: 'PAID' }, updated_at: '2026-09-02T00:00:00Z' },
    ]);
    const { ndjson, rowCount } = await exportEntities(pool);

    expect(rowCount).toBe(2);
    const lines = ndjson.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    // 정렬은 기본키(collection,id) — requests 가 users 보다 앞선다.
    expect(lines[0]).toMatchObject({ collection: 'requests', id: 'r1' });
    expect(lines[1]).toMatchObject({ collection: 'users', id: 'u1', data: { name: '김소비' } });
    // Date 든 문자열이든 ISO 문자열 하나로 고정된다.
    expect(lines[1]?.updated_at).toBe('2026-09-01T00:00:00.000Z');
  });

  it('행이 없으면 빈 덤프를 만든다(오류 아님)', async () => {
    const { ndjson, rowCount } = await exportEntities(fakePool([]));
    expect(rowCount).toBe(0);
    expect(ndjson).toBe('');
  });
});

describe('키 형식', () => {
  it('KST 날짜가 키에 박히고 다시 읽어낼 수 있다', () => {
    // 2026-09-22T19:30Z = KST 2026-09-23 04:30
    const key = backupKey(new Date('2026-09-22T19:30:00Z'));
    expect(key).toBe('db/dimol-20260923-043000.ndjson.gz');
    expect(backupDateOf(key)).toBe('20260923');
  });

  it('형식이 다른 키는 날짜로 읽지 않는다', () => {
    expect(backupDateOf('db/기타파일.txt')).toBeUndefined();
  });
});

describe('보관기간 정리', () => {
  const now = new Date('2026-09-23T00:00:00Z');

  it('보관기간이 지난 것만 고른다', () => {
    const objects: BackupObject[] = [
      { key: 'db/old.ndjson.gz', size: 1, lastModified: new Date(now.getTime() - 40 * day) },
      { key: 'db/recent.ndjson.gz', size: 1, lastModified: new Date(now.getTime() - 3 * day) },
    ];
    expect(expiredKeys(objects, 30, now)).toEqual(['db/old.ndjson.gz']);
  });

  it('전부 오래됐어도 최신 하나는 남긴다 — 복구 수단이 0 이 되면 안 된다', () => {
    const objects: BackupObject[] = [
      { key: 'db/a.ndjson.gz', size: 1, lastModified: new Date(now.getTime() - 100 * day) },
      { key: 'db/b.ndjson.gz', size: 1, lastModified: new Date(now.getTime() - 90 * day) },
    ];
    expect(expiredKeys(objects, 30, now)).toEqual(['db/a.ndjson.gz']);
  });

  it('하나뿐이면 아무것도 지우지 않는다', () => {
    const objects: BackupObject[] = [
      { key: 'db/only.ndjson.gz', size: 1, lastModified: new Date(now.getTime() - 999 * day) },
    ];
    expect(expiredKeys(objects, 30, now)).toEqual([]);
  });
});

describe('runDbBackup', () => {
  it('덤프를 gzip 으로 올리고, 풀면 원래 행이 나온다', async () => {
    const pool = fakePool([
      { collection: 'users', id: 'u1', data: { name: '김소비', phone: '01011110001' }, updated_at: '2026-09-01T00:00:00Z' },
    ]);
    const storage = fakeStorage();
    const result = await runDbBackup({
      pool,
      storage,
      retentionDays: 30,
      now: () => new Date('2026-09-22T19:30:00Z'),
    });

    expect(result.rowCount).toBe(1);
    expect(result.key).toBe('db/dimol-20260923-043000.ndjson.gz');
    const restored = JSON.parse(gunzipSync(storage.bodies.get(result.key) as Uint8Array).toString().trim()) as {
      data: { phone: string };
    };
    expect(restored.data.phone).toBe('01011110001');
  });

  it('업로드가 실패하면 옛 백업을 지우지 않는다', async () => {
    const storage = fakeStorage([
      { key: 'db/old.ndjson.gz', size: 1, lastModified: new Date('2020-01-01T00:00:00Z') },
    ]);
    storage.failPut = true;

    await expect(
      runDbBackup({ pool: fakePool([]), storage, retentionDays: 1 }),
    ).rejects.toThrow('업로드 실패');
    expect(storage.objects.has('db/old.ndjson.gz')).toBe(true);
  });
});
