import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

/**
 * 현장 사진 스토리지(S3 호환) presigned URL 발급.
 * 버킷은 비공개 전제 — 업로드(PUT)/조회(GET) 모두 presigned URL 로만 접근한다.
 * 접속 키는 .env 에서만 읽는다 (CLAUDE.md 절대 규칙).
 */

let client: S3Client | null = null;

/** 스토리지 환경변수가 채워져 있는지. 미설정이면 라우트가 503 으로 안내한다. */
export function isStorageConfigured(): boolean {
  const { bucket, accessKeyId, secretAccessKey } = env.storage;
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error('스토리지 미설정: STORAGE_BUCKET/ACCESS_KEY 환경변수를 확인하세요.');
  }
  if (!client) {
    client = new S3Client({
      region: env.storage.region,
      // endpoint 미설정(undefined) 시 AWS S3 기본 엔드포인트.
      endpoint: env.storage.endpoint || undefined,
      forcePathStyle: env.storage.forcePathStyle,
      credentials: {
        accessKeyId: env.storage.accessKeyId as string,
        secretAccessKey: env.storage.secretAccessKey as string,
      },
    });
  }
  return client;
}

export interface PresignedUpload {
  /** 스토리지 오브젝트 키 — 매칭요청에 연결할 값. */
  key: string;
  /** presigned PUT URL. 앱이 이 URL 로 파일을 직접 업로드한다. */
  uploadUrl: string;
  /** 업로드 요청에 그대로 실어야 하는 헤더 (서명에 포함됨 — 불일치 시 업로드 실패). */
  requiredHeaders: { 'Content-Type': string; 'Content-Length': string };
  expiresInSec: number;
}

/**
 * 업로드용 presigned PUT URL 발급.
 * Content-Type / Content-Length 를 서명에 포함해, presign 때 검증한 형식·크기와
 * 다른 파일은 스토리지 단에서 거부되도록 한다.
 */
export async function presignSitePhotoUpload(params: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignedUpload> {
  const expiresInSec = env.storage.uploadUrlTtlSec;
  const command = new PutObjectCommand({
    Bucket: env.storage.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: expiresInSec });
  return {
    key: params.key,
    uploadUrl,
    requiredHeaders: {
      'Content-Type': params.contentType,
      'Content-Length': String(params.contentLength),
    },
    expiresInSec,
  };
}

/** 조회용 presigned GET URL 발급 (매칭요청 상세 화면의 사진 표시용). */
export async function presignSitePhotoView(key: string): Promise<{
  key: string;
  viewUrl: string;
  expiresInSec: number;
}> {
  const expiresInSec = env.storage.viewUrlTtlSec;
  const command = new GetObjectCommand({ Bucket: env.storage.bucket, Key: key });
  const viewUrl = await getSignedUrl(getClient(), command, { expiresIn: expiresInSec });
  return { key, viewUrl, expiresInSec };
}
