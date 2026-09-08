import { api } from './http';

/**
 * 사진 업로드/조회 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 사진 업로드 및 조회 API
export const getSitePhotoViewUrl = (key: string) =>
  api<{ key: string; viewUrl: string; expiresInSec: number }>(`/uploads/site-photos/view-url?key=${encodeURIComponent(key)}`);
