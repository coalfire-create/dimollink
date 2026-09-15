import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  totalFloorAreaM2,
  type BuildingLedgerInfo,
  type DimolVisionSummary,
  type RequestKind,
  type SiteCaptureSlotId,
  type WasteItem,
} from '@dimol/shared';
import { analyzeSiteWasteItems, type AnalyzeImage } from '../../api/client';
import { processCapturedPhoto } from '../../lib/photoQuality';
import type { CapturedPhoto } from '../../components/CameraCaptureModal';
import type { GuidedCaptureResult } from '../../components/GuidedSiteCaptureModal';

/**
 * 디몰비전 현장 사진 분석 — 촬영·선택 경로 3개를 한 곳으로 모은다.
 *
 * 들어오는 길은 셋(가이드 촬영·자유 촬영·앨범 선택)이지만 나가는 길은 하나다:
 * 이미지 배열 + 건축물대장 사실을 서버에 넘기고, 결과를 요청 종류에 따라 다르게 쓴다.
 * - 철거: 공정·위험 요인 요약을 요청에 싣는다.
 * - 운반/처리장: 소재 목록으로 폐기물 입력칸을 채운다(무게는 사용자가 확인).
 *
 * 앨범 사진도 촬영본과 같은 품질 게이트를 태운다 — 흐림·암전이 오인식의 주원인이다.
 */
export function useVisionAnalysis({
  kind,
  building,
  siteAddress,
  getFormAreaM2,
  onWasteItems,
  onError,
}: {
  kind: RequestKind;
  building: BuildingLedgerInfo | null;
  siteAddress: string;
  /** 대장 연면적이 없을 때 쓸 폼 입력 기반 연면적(호출 시점에 계산). */
  getFormAreaM2: () => number | undefined;
  /** 운반·처리장에서 분석된 소재로 입력칸을 채운다. */
  onWasteItems: (items: WasteItem[]) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [vision, setVision] = useState<DimolVisionSummary | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState(false);

  async function run(images: AnalyzeImage[]): Promise<void> {
    if (images.length === 0) return;
    setBusy(true);
    try {
      const { analysis, wasteItems } = await analyzeSiteWasteItems({
        images,
        buildingStructure: building?.strctCdNm,
        building: building ?? undefined,
        siteAddress: siteAddress.trim() || undefined,
        floorAreaM2: totalFloorAreaM2(building) ?? getFormAreaM2(),
      });

      if (kind === 'DEMOLITION') {
        setVision({
          summary: analysis.summary,
          hazards: analysis.hazards,
          materials: analysis.materials.map((m) => m.name),
          confidence: analysis.confidence,
          analyzedAt: analysis.analyzedAt,
        });
        setSummary(`현장 분석 완료: ${analysis.summary}`);
        return;
      }

      if (wasteItems.length === 0) {
        setSummary('사진에서 소재를 찾지 못했어요. 직접 입력해 주세요.');
        return;
      }
      onWasteItems(wasteItems);
      const method = analysis.method === 'AI_VISION' ? 'AI 분석' : '참고(목) 분석';
      setSummary(
        `${method}으로 소재 ${wasteItems.length}종을 채웠어요. 무게(kg)는 확인·수정해 주세요.`,
      );
    } catch {
      onError('사진 분석에 실패했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  /** 가이드 촬영(순서·방향 강제) 완료 — 슬롯을 함께 넘겨야 서버가 부위별 사전확률을 쓴다. */
  function handleGuidedComplete(photos: GuidedCaptureResult[]): void {
    setGuidedOpen(false);
    setSummary(null);
    void run(
      photos.map((p) => ({
        imageBase64: p.base64,
        mimeType: p.mimeType,
        slotId: p.slotId as SiteCaptureSlotId,
      })),
    );
  }

  function handleCameraCapture(photos: CapturedPhoto[]): void {
    setCameraOpen(false);
    setSummary(null);
    void run(
      photos.map((p) => ({
        imageBase64: p.base64,
        mimeType: p.mimeType,
        qualityWarnings: p.qualityWarnings,
      })),
    );
  }

  async function fillFromPhoto(): Promise<void> {
    setSummary(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });
    const asset = res.canceled ? undefined : res.assets[0];
    if (!asset?.base64) return;
    const processed = await processCapturedPhoto({
      base64: asset.base64,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    void run([
      {
        imageBase64: processed.base64,
        mimeType: processed.resized ? 'image/jpeg' : (asset.mimeType ?? 'image/jpeg'),
        qualityWarnings: processed.quality.reasons,
      },
    ]);
  }

  return {
    busy,
    summary,
    setSummary,
    vision,
    cameraOpen,
    setCameraOpen,
    guidedOpen,
    setGuidedOpen,
    handleGuidedComplete,
    handleCameraCapture,
    fillFromPhoto,
  };
}
