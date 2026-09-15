import { useRef, useState } from 'react';
import type { CameraType, CameraView } from 'expo-camera';
import { processCapturedPhoto } from '../../lib/photoQuality';
import type { CapturedPhoto } from '../CameraCaptureModal';

/**
 * 자유 촬영 상태 — 찍은 사진 모음, 셔터, 삭제, 완료.
 *
 * 품질 미달(흐림·암전·과노출)이어도 촬영을 막지 않는다. 대신 사유를 사진에 달아
 * 서버로 보내고, 서버가 그 사진에서 나온 판정의 신뢰도를 낮춘다 — 현장에 다시 갈 수
 * 없는 경우가 많아서, 흐린 사진이라도 없는 것보다 낫다.
 */
export function useFreeCapture({
  maxPhotos,
  onCapture,
  onClose,
}: {
  maxPhotos: number;
  onCapture: (photos: CapturedPhoto[]) => void;
  onClose: () => void;
}) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturing, setCapturing] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const cameraRef = useRef<CameraView | null>(null);

  const reachedMax = photos.length >= maxPhotos;

  async function shutter() {
    if (!cameraRef.current || capturing || reachedMax) return;
    setCapturing(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      if (!shot) return;
      let base64 = shot.base64 ?? '';
      // 웹 등에서 base64 가 data URL 로 넘어오는 경우 접두어 제거.
      if (!base64 && shot.uri.startsWith('data:')) base64 = shot.uri.split(',')[1] ?? '';
      if (!base64) return;

      // 업로드용으로 축소(장변 상한·JPEG 재인코딩). 실패해도 원본으로 폴백한다.
      const processed = await processCapturedPhoto({
        base64,
        uri: shot.uri.startsWith('data:') ? shot.uri : `data:image/jpeg;base64,${base64}`,
        mimeType: 'image/jpeg',
      });
      setPhotos((prev) => [
        ...prev,
        {
          base64: processed.base64,
          mimeType: 'image/jpeg',
          uri: shot.uri,
          qualityWarnings: processed.quality.reasons,
        },
      ]);
    } finally {
      setCapturing(false);
    }
  }

  /** 닫을 때는 찍은 사진을 버린다 — 넘기지 않고 나갔다면 쓰지 않겠다는 뜻이다. */
  function close() {
    setPhotos([]);
    onClose();
  }

  function done() {
    if (photos.length === 0) return;
    const captured = photos;
    setPhotos([]);
    onCapture(captured);
  }

  return {
    cameraRef,
    facing,
    flip: () => setFacing((prev) => (prev === 'back' ? 'front' : 'back')),
    photos,
    capturing,
    reachedMax,
    shutter,
    remove: (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index)),
    close,
    done,
  };
}
