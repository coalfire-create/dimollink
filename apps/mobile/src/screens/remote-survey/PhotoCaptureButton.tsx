import React, { useState } from 'react';
import { AppButton } from '../../components/ui';
import { CameraCaptureModal, type CapturedPhoto } from '../../components/CameraCaptureModal';

/**
 * "찍기" 버튼 + 자유 촬영 카메라 한 쌍.
 *
 * 항목마다 카메라를 여닫는 상태를 화면 껍데기가 들고 있으면 항목이 늘 때마다 껍데기를
 * 고쳐야 한다. 버튼이 자기 카메라를 들고 있게 해서 어디에 놓아도 그대로 동작한다.
 */
export function PhotoCaptureButton({
  label,
  maxPhotos,
  disabled,
  variant = 'primary',
  onPhotos,
}: {
  label: string;
  maxPhotos: number;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  onPhotos: (photos: CapturedPhoto[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton
        label={label}
        variant={variant}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <CameraCaptureModal
        visible={open}
        maxPhotos={maxPhotos}
        onClose={() => setOpen(false)}
        onCapture={(photos) => {
          setOpen(false);
          onPhotos(photos);
        }}
      />
    </>
  );
}
