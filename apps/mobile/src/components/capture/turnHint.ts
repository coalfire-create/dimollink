import { azimuthDelta, type SiteCaptureSlot, type SiteCaptureState } from '@dimol/shared';

/**
 * 목표 방향까지 얼마나 돌려야/기울여야 하는지 한 줄 안내.
 *
 * "정렬되지 않았어요"만 띄우면 사용자는 어느 쪽으로 돌려야 할지 몰라 제자리에서 헤맨다.
 * 방향(좌/우)과 대략의 각도를 함께 주면 한 번에 맞춘다.
 */
export function turnHint(
  slot: SiteCaptureSlot,
  session: SiteCaptureState,
  reading: { azimuth: number; pitch: number } | null,
): string {
  if (!reading) return '';

  if (slot.relativeAzimuth !== null && session.baseAzimuth !== null) {
    const target = (session.baseAzimuth + slot.relativeAzimuth) % 360;
    // 시계방향 부호 차이: 양수면 오른쪽으로 더 돌아야 한다.
    const signed = (((target - reading.azimuth + 540) % 360) - 180) * -1;
    const degrees = Math.round(azimuthDelta(reading.azimuth, target));
    return signed >= 0 ? `오른쪽으로 약 ${degrees}도` : `왼쪽으로 약 ${degrees}도`;
  }

  if (slot.pitchRange !== null) {
    const [min, max] = slot.pitchRange;
    if (reading.pitch < min) return '폰을 조금 더 아래로';
    if (reading.pitch > max) return '폰을 조금 더 위로';
  }
  return '';
}
