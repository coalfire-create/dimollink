import { randomUUID } from 'node:crypto';
import {
  SITE_PHOTO_KEY_PREFIX,
  SITE_PHOTO_MAX_BYTES,
  SITE_PHOTO_PURPOSES,
  SITE_PHOTO_PURPOSE_PATH,
  isAllowedSitePhotoContentType,
  sitePhotoExtension,
  type SitePhotoContentType,
  type SitePhotoPurpose,
} from '@dimol/shared';

/** presign 요청 검증 통과 값. */
export interface PresignInput {
  purpose: SitePhotoPurpose;
  contentType: SitePhotoContentType;
  /** 업로드할 파일 크기(바이트). presigned PUT 서명에 포함해 크기를 강제한다. */
  contentLength: number;
}

export type PresignValidation = { ok: true; value: PresignInput } | { ok: false; error: string };

/**
 * presign 요청 본문 검증 (순수 함수 — S3 호출 없음).
 * 형식/크기 제한을 여기서 걸러, 스토리지에 허용 외 오브젝트가 생기지 않게 한다.
 */
export function validatePresignInput(raw: unknown): PresignValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '요청 본문이 필요합니다.' };
  }
  const { purpose, contentType, contentLength } = raw as Record<string, unknown>;

  if (typeof purpose !== 'string' || !SITE_PHOTO_PURPOSES.includes(purpose as SitePhotoPurpose)) {
    return {
      ok: false,
      error: `purpose 는 ${SITE_PHOTO_PURPOSES.join(' | ')} 중 하나여야 합니다.`,
    };
  }
  if (typeof contentType !== 'string' || !isAllowedSitePhotoContentType(contentType)) {
    return { ok: false, error: '허용되지 않는 이미지 형식입니다. (jpeg/png/webp/heic)' };
  }
  if (
    typeof contentLength !== 'number' ||
    !Number.isInteger(contentLength) ||
    contentLength <= 0
  ) {
    return { ok: false, error: 'contentLength(파일 크기, 바이트)가 필요합니다.' };
  }
  if (contentLength > SITE_PHOTO_MAX_BYTES) {
    const maxMb = Math.floor(SITE_PHOTO_MAX_BYTES / (1024 * 1024));
    return { ok: false, error: `사진 1장 최대 ${maxMb}MB 까지 업로드할 수 있습니다.` };
  }

  return {
    ok: true,
    value: {
      purpose: purpose as SitePhotoPurpose,
      contentType,
      contentLength,
    },
  };
}

/**
 * 현장 사진 오브젝트 키 생성: `site-photos/<purpose>/<uuid>.<ext>`.
 * 키에는 PII(사업자번호·업체명 등)를 넣지 않는다 — 무작위 UUID 만 사용.
 */
export function buildSitePhotoKey(
  purpose: SitePhotoPurpose,
  contentType: SitePhotoContentType,
): string {
  const dir = SITE_PHOTO_PURPOSE_PATH[purpose];
  return `${SITE_PHOTO_KEY_PREFIX}${dir}/${randomUUID()}.${sitePhotoExtension(contentType)}`;
}
