import { Platform } from 'react-native';
import { decode as decodeJpeg } from 'jpeg-js';
import {
  SHARPNESS_SAMPLE_PER_AXIS,
  assessPhotoQuality,
  computeLumaStats,
  computeSharpness,
  subsampleRgba,
  type LumaStats,
} from '@dimol/shared';

/**
 * 촬영 직후 사진 전처리 — ①품질(암전/렌즈 가림/흐림) 검증 ②디몰비전 전송용 축소.
 * 둘 다 AI 호출 없이 순수 클라이언트 연산이며, 디코딩을 한 번만 하고 두 목적에 나눠 쓴다.
 *
 * 플랫폼별 픽셀 추출:
 * - 웹(react-native-web): 캔버스에 그려 `getImageData` 로 RGBA 픽셀을 얻는다.
 * - 네이티브(Android/iOS): 캔버스가 없으므로 JPEG(base64)를 순수 JS 디코더(jpeg-js)로
 *   풀어 RGBA 를 얻는다 — 네이티브 재빌드 없이 동작한다.
 *
 * 어느 경로든 실패하면 촬영을 막지 않는다(사용자 흐름 우선, supported:false / 원본 그대로).
 */

export interface QualityResult {
  /** 이 플랫폼에서 품질 검증을 실제 수행했는지. */
  supported: boolean;
  /** 품질 기준 통과 여부(미지원이면 통과로 둔다). */
  ok: boolean;
  /** 계산된 밝기 통계(지원 시). */
  stats?: LumaStats;
  /** 선명도(라플라시안 분산). 클수록 선명. */
  sharpness?: number;
  /** 미달 사유 — 사용자에게 무엇이 문제인지 알려주고, 서버에는 경고로 넘긴다. */
  reasons: string[];
}

export interface QualityInput {
  /** JPEG base64(접두어 없음). 네이티브 디코딩에 사용. */
  base64: string;
  /** 이미지 URI(웹 캔버스 로딩에 사용). data URL 또는 blob URL. */
  uri: string;
  mimeType: string;
}

/** 전처리 결과 — 품질 판정 + 업로드용 base64(축소 성공 시 축소본). */
export interface ProcessedPhoto {
  quality: QualityResult;
  /** 업로드에 쓸 JPEG base64(접두어 없음). 축소 실패 시 원본 그대로. */
  base64: string;
  /** 실제로 축소가 적용됐는지. */
  resized: boolean;
}

/** 통계를 뽑을 다운샘플 해상도(작을수록 빠름, 밝기·분산엔 충분). */
const SAMPLE_SIZE = 64;

/**
 * 업로드용 장변 상한(px). 비전 모델은 1500px 내외에서 해상도 이득이 사라지므로,
 * 그 이상은 업로드 시간·토큰만 늘린다. 이 값만 바꿔 조정한다(호출부 하드코딩 금지).
 */
export const UPLOAD_MAX_EDGE = 1600;
/** 업로드용 JPEG 품질(0~100). 소재 질감이 뭉개지지 않는 선. */
export const UPLOAD_JPEG_QUALITY = 72;

const PASS: QualityResult = { supported: false, ok: true, reasons: [] };

/** 원본 대비 축소 배율. 이미 충분히 작으면 null(재인코딩하지 않는다). */
function scaleFor(width: number, height: number): number | null {
  const longest = Math.max(width, height);
  if (longest <= UPLOAD_MAX_EDGE) return null;
  return UPLOAD_MAX_EDGE / longest;
}

// ── 웹: 캔버스 ────────────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/**
 * 웹에서 선명도만 따로 잰다. 밝기 통계용 64px 캔버스로는 고주파가 이미 사라져
 * 흐린 사진을 잡지 못하므로, 더 큰 캔버스에 한 번 더 그려 라플라시안을 계산한다.
 * 실패하면 undefined — 선명도 검사만 건너뛴다(촬영을 막지 않는다).
 */
function sharpnessFromCanvas(img: HTMLImageElement): number | undefined {
  try {
    const side = SHARPNESS_SAMPLE_PER_AXIS;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, side, side);
    return computeSharpness(ctx.getImageData(0, 0, side, side).data, side, side);
  } catch {
    return undefined;
  }
}

async function processWeb(input: QualityInput): Promise<ProcessedPhoto> {
  if (typeof document === 'undefined') {
    return { quality: PASS, base64: input.base64, resized: false };
  }
  const img = await loadImage(input.uri);

  // ① 품질 통계 — 작은 캔버스 한 장.
  let quality: QualityResult = PASS;
  const statCanvas = document.createElement('canvas');
  statCanvas.width = SAMPLE_SIZE;
  statCanvas.height = SAMPLE_SIZE;
  const statCtx = statCanvas.getContext('2d');
  if (statCtx) {
    statCtx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = statCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const stats = computeLumaStats(data);
    // 선명도는 고주파가 살아 있어야 재므로 더 큰 표본으로 따로 그린다.
    const sharpness = sharpnessFromCanvas(img);
    quality = { supported: true, ...assessPhotoQuality(stats, sharpness), stats, sharpness };
  }

  // ② 업로드용 축소 — 장변이 상한을 넘을 때만.
  const scale = scaleFor(img.naturalWidth, img.naturalHeight);
  if (scale === null) return { quality, base64: input.base64, resized: false };

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { quality, base64: input.base64, resized: false };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY / 100);
  const base64 = dataUrl.split(',')[1] ?? '';
  if (!base64) return { quality, base64: input.base64, resized: false };
  return { quality, base64, resized: true };
}

// ── 네이티브: jpeg-js 디코딩 ─────────────────────────────────────────────────
/** base64 → 바이트. atob 가 없는 런타임을 위해 순수 JS 디코더로 폴백한다. */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): Uint8Array | null {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') {
    const bin = g.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  if (clean.length === 0) return null;
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i] ?? 'A');
    const c1 = B64_CHARS.indexOf(clean[i + 1] ?? 'A');
    const c2 = B64_CHARS.indexOf(clean[i + 2] ?? 'A');
    const c3 = B64_CHARS.indexOf(clean[i + 3] ?? 'A');
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (i + 2 < clean.length) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (i + 3 < clean.length) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes.subarray(0, p);
}

import * as ImageManipulator from 'expo-image-manipulator';

async function processNative(input: QualityInput): Promise<ProcessedPhoto> {
  const fallback: ProcessedPhoto = { quality: PASS, base64: input.base64, resized: false };
  const bytes = base64ToBytes(input.base64);
  if (!bytes) return fallback;
  // useTArray 로 복사 최소화, 순수 JS 디코딩(네이티브 모듈 불필요).
  const decoded = decodeJpeg(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
  if (!decoded?.data || !decoded.width || !decoded.height) return fallback;

  const pixels = subsampleRgba(decoded.data, decoded.width, decoded.height, SAMPLE_SIZE);
  const stats = computeLumaStats(pixels);
  // 선명도용 표본은 더 크게 뜬다(64px 로 줄이면 흐림 신호가 사라진다).
  const sharpSide = Math.min(
    SHARPNESS_SAMPLE_PER_AXIS,
    Math.min(decoded.width, decoded.height),
  );
  const sharpPixels = subsampleRgba(decoded.data, decoded.width, decoded.height, sharpSide);
  const sharpWidth = Math.ceil(decoded.width / Math.max(1, Math.floor(decoded.width / sharpSide)));
  const sharpHeight = Math.ceil(
    decoded.height / Math.max(1, Math.floor(decoded.height / sharpSide)),
  );
  const sharpness = computeSharpness(sharpPixels, sharpWidth, sharpHeight);
  const quality: QualityResult = {
    supported: true,
    ...assessPhotoQuality(stats, sharpness),
    stats,
    sharpness,
  };

  const scale = scaleFor(decoded.width, decoded.height);
  if (scale === null) return { quality, base64: input.base64, resized: false };
  
  try {
    const targetW = Math.max(1, Math.round(decoded.width * scale));
    const targetH = Math.max(1, Math.round(decoded.height * scale));
    
    // 네이티브 성능 이점을 살리기 위해 expo-image-manipulator 사용
    const result = await ImageManipulator.manipulateAsync(
      input.uri,
      [{ resize: { width: targetW, height: targetH } }],
      { compress: UPLOAD_JPEG_QUALITY / 100, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    
    if (result.base64) {
      return { quality, base64: result.base64, resized: true };
    }
    return { quality, base64: input.base64, resized: false };
  } catch {
    return { quality, base64: input.base64, resized: false };
  }
}

/**
 * 촬영 사진 전처리(품질 검증 + 업로드용 축소). 실패해도 예외를 던지지 않는다 —
 * 품질은 '통과', 이미지는 원본으로 폴백해 촬영 흐름을 막지 않는다.
 */
export async function processCapturedPhoto(input: QualityInput): Promise<ProcessedPhoto> {
  const fallback: ProcessedPhoto = { quality: PASS, base64: input.base64, resized: false };
  try {
    if (Platform.OS === 'web') return await processWeb(input);
    // 네이티브는 JPEG 만 디코딩(카메라 산출물은 JPEG). 그 외 포맷은 원본 통과.
    if (input.mimeType !== 'image/jpeg' || !input.base64) return fallback;
    return await processNative(input);
  } catch {
    return fallback;
  }
}

/** 품질 검증만 필요할 때(축소 결과는 버린다). */
export async function analyzePhotoQuality(input: QualityInput): Promise<QualityResult> {
  return (await processCapturedPhoto(input)).quality;
}
