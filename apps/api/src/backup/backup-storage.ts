import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

/**
 * DB 백업 보관소(S3 호환).
 *
 * 현장 사진 버킷과 **일부러 분리**한다. 백업 덤프에는 전 회원의 휴대폰번호·사업자등록번호가
 * 들어 있어서, 앱이 presigned URL 발급에 쓰는 사진 버킷 키가 새면 백업까지 통째로 새는
 * 구조가 되면 안 된다. 키도 버킷도 따로 둔다.
 *
 * 접속 키는 .env(운영은 Railway 변수)에서만 읽는다 — CLAUDE.md 절대 규칙.
 */

/** 백업 오브젝트 키 접두사. 한 버킷을 다른 용도와 나눠 쓸 때를 대비해 붙인다. */
export const BACKUP_PREFIX = 'db/';

export interface BackupObject {
  key: string;
  size: number;
  lastModified?: Date;
}

export interface BackupStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  list(): Promise<BackupObject[]>;
  remove(keys: readonly string[]): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

let client: S3Client | null = null;

/** 백업 스토리지가 설정돼 있는지. 미설정이면 백업 작업이 조용히 꺼진다(기동은 막지 않는다). */
export function isBackupConfigured(): boolean {
  const { bucket, accessKeyId, secretAccessKey } = env.backup;
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

function getClient(): S3Client {
  if (!isBackupConfigured()) {
    throw new Error('백업 스토리지 미설정: BACKUP_BUCKET/BACKUP_ACCESS_KEY_ID 를 확인하세요.');
  }
  if (!client) {
    client = new S3Client({
      region: env.backup.region,
      endpoint: env.backup.endpoint || undefined,
      forcePathStyle: env.backup.forcePathStyle,
      credentials: {
        accessKeyId: env.backup.accessKeyId as string,
        secretAccessKey: env.backup.secretAccessKey as string,
      },
    });
  }
  return client;
}

/** 운영용 기본 구현. 테스트는 BackupStorage 를 직접 주입한다. */
export function createBackupStorage(): BackupStorage {
  const bucket = env.backup.bucket as string;
  return {
    async put(key, body, contentType) {
      await getClient().send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async list() {
      const out: BackupObject[] = [];
      let token: string | undefined;
      // 보관 기간이 길어지면 1000개를 넘는다 — 페이지를 끝까지 넘긴다.
      do {
        const page = await getClient().send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token }),
        );
        for (const obj of page.Contents ?? []) {
          if (obj.Key) out.push({ key: obj.Key, size: obj.Size ?? 0, lastModified: obj.LastModified });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async remove(keys) {
      if (keys.length === 0) return;
      // DeleteObjects 는 한 번에 1000개까지.
      for (let i = 0; i < keys.length; i += 1000) {
        await getClient().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
          }),
        );
      }
    },
    async get(key) {
      const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
      if (!body?.transformToByteArray) throw new Error(`백업 본문을 읽지 못했습니다: ${key}`);
      return body.transformToByteArray();
    },
  };
}
