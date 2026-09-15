import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { SiteAnalysis } from '@dimol/shared';
import { ApiError, analyzeSite } from '../../api/client';
import type { CapturedPhoto } from '../../components/CameraCaptureModal';
import type { Scan3DCaptureResult } from '../../components/Scan3DCaptureModal';
import { processCapturedPhoto } from '../../lib/photoQuality';
import { useBuildingLedger } from '../../lib/useBuildingLedger';
import { useScan3D } from '../../lib/useScan3D';

/**
 * 현장 진단 화면의 상태 — 주소 확인 → 사진 확보 → 분석, 그리고 3D 스캔 곁가지.
 *
 * 요청 폼과 같은 규칙을 지킨다: **주소를 먼저 받고** 건축물대장에서 확인한 사실을
 * 분석의 기준으로 넘긴다. 건물이 무엇인지 모르는 채 사진만 보면 같은 회색 벽이
 * 콘크리트도 되고 석면 슬레이트도 된다.
 */

/** 1×1 투명 PNG — 서버가 예시(목) 리포트를 돌려주게 하는 최소 입력. */
const SAMPLE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export interface PickedImage {
  base64: string;
  mimeType: string;
  uri: string;
  /** 품질 미달 사유 — 서버로 함께 보내 그 사진 근거의 신뢰도를 낮춘다. */
  qualityWarnings?: string[];
}

function mimeFromUri(uri: string): string {
  return uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

export function useSiteAnalysis() {
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<SiteAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // 3D 스캔 — 촬영 → 업로드 → 복원 폴링 → 뷰어.
  const [scanOpen, setScanOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  /** 3D 화면에서 잰 길이(복원 좌표계 단위). 어떤 물건이었는지 고르면 배율이 확정된다. */
  const [measuredUnits, setMeasuredUnits] = useState<number | null>(null);
  const scan = useScan3D();

  const [siteAddress, setSiteAddress] = useState('');
  const ledger = useBuildingLedger({});

  const addressReady = siteAddress.trim().length > 0;
  const captureLocked = !addressReady || ledger.state === 'loading';

  function pickAddress(address: string) {
    setSiteAddress(address);
    setResult(null); // 주소가 바뀌면 이전 건물 기준의 결과는 더 이상 맞지 않는다.
    void ledger.fetchLedger(address);
  }

  /** 주소 없이 촬영/선택을 시도하면 막고 이유를 알린다. */
  function guardCapture(open: () => void) {
    if (!addressReady) {
      setError(
        '먼저 현장 주소를 지정해 주세요. 주소를 알아야 건축물대장 정보를 확인하고 정확히 분석할 수 있어요.',
      );
      return;
    }
    setError(null);
    open();
  }

  /** 품질 경고는 막지 않고 알리기만 한다 — 흐린 사진이라도 없는 것보다 낫다. */
  function warnIfLowQuality(reasons?: string[]) {
    if (reasons && reasons.length > 0) {
      setError(`${reasons.join(', ')}. 더 선명한 사진일수록 분석이 정확해요.`);
    }
  }

  async function applyAsset(asset: ImagePicker.ImagePickerAsset) {
    if (!asset.base64) {
      setError('사진을 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    setResult(null);
    setError(null);
    const mimeType = asset.mimeType ?? mimeFromUri(asset.uri);
    // 앨범 사진도 촬영본과 같은 품질 게이트를 태운다(흐림·암전은 오인식의 주원인).
    const processed = await processCapturedPhoto({
      base64: asset.base64,
      uri: asset.uri,
      mimeType,
    });
    setImage({
      base64: processed.base64,
      mimeType: processed.resized ? 'image/jpeg' : mimeType,
      uri: asset.uri,
      qualityWarnings: processed.quality.reasons,
    });
    warnIfLowQuality(processed.quality.reasons);
  }

  /** 커스텀 카메라(가이드 오버레이) 촬영 완료 — 대표로 첫 장을 미리보기로 쓴다. */
  function handleCameraCapture(photos: CapturedPhoto[]) {
    const first = photos[0];
    if (!first) return;
    setResult(null);
    setError(null);
    setImage(first);
    setCameraOpen(false);
    warnIfLowQuality(first.qualityWarnings);
  }

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets[0]) await applyAsset(res.assets[0]);
  }

  function handleScanCaptured(capture: Scan3DCaptureResult) {
    setScanOpen(false);
    // 대장 정보를 함께 넘겨야 AR 포즈가 없을 때 연면적으로 스케일을 역산할 수 있다.
    void scan.start(capture, ledger.building ?? undefined);
  }

  /** 분석 요청의 공통 인자 — 어떤 경로로 들어온 사진이든 같은 기준으로 판독한다. */
  function analysisContext() {
    return {
      buildingStructure: ledger.building?.strctCdNm,
      building: ledger.building ?? undefined,
      siteAddress: siteAddress.trim() || undefined,
    };
  }

  async function analyze() {
    if (!image) return;
    setError(null);
    setLoading(true);
    try {
      setResult(
        await analyzeSite({
          images: [
            {
              imageBase64: image.base64,
              mimeType: image.mimeType,
              qualityWarnings: image.qualityWarnings,
            },
          ],
          ...analysisContext(),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '분석에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  /** 예시 리포트 — 현장에 가기 전에 "무엇이 나오는지" 먼저 보여준다. */
  async function analyzeSample() {
    setImage({
      base64: SAMPLE_BASE64,
      mimeType: 'image/png',
      uri: `data:image/png;base64,${SAMPLE_BASE64}`,
    });
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(
        await analyzeSite({
          imageBase64: SAMPLE_BASE64,
          mimeType: 'image/png',
          ...analysisContext(),
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '분석에 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  return {
    image,
    clearImage: () => setImage(null),
    result,
    error,
    loading,
    siteAddress,
    pickAddress,
    ledger,
    addressReady,
    captureLocked,
    guardCapture,
    analyze,
    analyzeSample,
    pickFromLibrary,
    cameraOpen,
    setCameraOpen,
    handleCameraCapture,
    // 3D 스캔
    scan,
    scanOpen,
    setScanOpen,
    handleScanCaptured,
    viewerOpen,
    setViewerOpen,
    measuredUnits,
    setMeasuredUnits,
  };
}
