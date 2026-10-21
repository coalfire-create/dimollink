import { Platform, Vibration } from 'react-native';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/**
 * 모바일(iOS/Android) 및 웹(HTML5 Vibration API)을 지원하는 무의존성 햅틱 피드백.
 * 야외 현장 작업 중이거나 장갑을 꼈을 때 버튼 터치나 중요 액션(결제·수락 등)의 성공을
 * 물리적 진동으로 인지하도록 돕는다.
 */
export function triggerHaptic(type: HapticType = 'light'): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
        switch (type) {
          case 'light':
            navigator.vibrate(10);
            break;
          case 'medium':
            navigator.vibrate(20);
            break;
          case 'heavy':
            navigator.vibrate(35);
            break;
          case 'success':
            navigator.vibrate([15, 30, 25]);
            break;
          case 'warning':
          case 'error':
            navigator.vibrate([25, 40, 25, 40, 25]);
            break;
        }
      }
      return;
    }

    // React Native 네이티브 환경(iOS / Android)
    switch (type) {
      case 'light':
        Vibration.vibrate(12);
        break;
      case 'medium':
        Vibration.vibrate(25);
        break;
      case 'heavy':
        Vibration.vibrate(40);
        break;
      case 'success':
        Vibration.vibrate([0, 15, 40, 25]);
        break;
      case 'warning':
      case 'error':
        Vibration.vibrate([0, 25, 40, 25, 40, 25]);
        break;
    }
  } catch {
    // 진동 권한이 없거나 지원하지 않는 기기에서는 무음 무동작 유지
  }
}
