import type { SitePhotoPurpose } from '@dimol/shared';
import { api, ApiError } from './http';

/**
 * 사진 업로드/조회 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 사진 업로드 및 조회 API
export const getSitePhotoViewUrl = (key: string) =>
  api<{ key: string; viewUrl: string; expiresInSec: number }>(`/uploads/site-photos/view-url?key=${encodeURIComponent(key)}`);

interface SitePhotoPresign {
  key: string;
  uploadUrl: string;
  requiredHeaders: { 'Content-Type': string; 'Content-Length': string };
  expiresInSec: number;
}

/**
 * 찍은 사진 한 장을 스토리지에 올리고 key 를 돌려준다.
 * presign → 스토리지에 직접 PUT(API 를 거치지 않는다). 서명에 형식·크기가 들어 있어
 * 헤더가 다르면 스토리지가 거부한다.
 */
export async function uploadSitePhoto(
  photo: { uri: string; mimeType?: string },
  purpose: SitePhotoPurpose = 'DEMOLITION_REQUEST',
): Promise<string> {
  const blob = await (await fetch(photo.uri)).blob();
  const contentType = photo.mimeType || blob.type || 'image/jpeg';
  const presigned = await api<SitePhotoPresign>('/uploads/site-photos/presign', {
    method: 'POST',
    body: JSON.stringify({ purpose, contentType, contentLength: blob.size }),
  });
  const res = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.requiredHeaders,
    body: blob,
  });
  if (!res.ok) throw new ApiError('사진을 올리지 못했어요. 인터넷 연결을 확인해 주세요.', res.status);
  return presigned.key;
}
