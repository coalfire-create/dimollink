import { randomUUID } from 'node:crypto';
import {
  SCAN_VIDEO_MAX_BYTES,
  isAllowedScanVideoContentType,
  scanObjectKeys,
  scanVideoExtension,
  type ScanVideoContentType,
} from '@dimol/shared';

/**
 * 스캔 영상 업로드 presign 검증 (순수 함수 — S3 호출 없음).
 * 현장 사진(`storage/site-photo.ts`)과 같은 원칙: 형식·크기를 여기서 걸러
 * 스토리지에 허용 외 오브젝트가 생기지 않게 한다.
 */

export interface ScanPresignInput {
  contentType: ScanVideoContentType;
  contentLength: number;
}

export type ScanPresignValidation =
  | { ok: true; value: ScanPresignInput }
  | { ok: false; error: string };

export function validateScanPresignInput(raw: unknown): ScanPresignValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '요청 본문이 필요합니다.' };
  }
  const { contentType, contentLength } = raw as Record<string, unknown>;

  if (typeof contentType !== 'string' || !isAllowedScanVideoContentType(contentType)) {
    return { ok: false, error: '허용되지 않는 영상 형식입니다. (mp4/mov)' };
  }
  if (
    typeof contentLength !== 'number' ||
    !Number.isInteger(contentLength) ||
    contentLength <= 0
  ) {
    return { ok: false, error: 'contentLength(파일 크기, 바이트)가 필요합니다.' };
  }
  if (contentLength > SCAN_VIDEO_MAX_BYTES) {
    const maxMb = Math.floor(SCAN_VIDEO_MAX_BYTES / (1024 * 1024));
    return {
      ok: false,
      error: `영상은 최대 ${maxMb}MB 까지 올릴 수 있습니다. 더 짧게 촬영해 주세요.`,
    };
  }
  return { ok: true, value: { contentType, contentLength } };
}

/**
 * 스캔 1건의 오브젝트 키를 만든다: `site-scans/<uuid>/video.<ext>`.
 * 스캔 id 로 묶어 두면 영상·장면·메시·썸네일이 한 폴더에 모여 정리·삭제가 쉽다.
 * 키에는 PII 를 넣지 않는다 — 무작위 UUID 만.
 */
export function buildScanKeys(contentType: ScanVideoContentType, scanId = randomUUID()) {
  return { scanId, ...scanObjectKeys(scanId, scanVideoExtension(contentType)) };
}
