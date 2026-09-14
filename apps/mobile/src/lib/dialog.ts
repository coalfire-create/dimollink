import { Alert, Platform } from 'react-native';

/**
 * 확인·안내 대화상자 — 앱과 웹 양쪽에서 실제로 뜨게 한다.
 *
 * react-native-web 의 `Alert.alert` 는 **빈 함수**다(`static alert() {}`).
 * 그래서 웹 빌드에서 `Alert.alert(제목, 본문, [취소, 실행])` 을 쓰면
 * 대화상자가 안 뜨는 정도가 아니라 **onPress 가 영영 호출되지 않아 동작 자체가 사라진다**.
 * 실제로 관리자 백오피스의 승인·취소가 웹에서 아무 반응이 없었고,
 * "환불이 남았습니다" 같은 돈 관련 경고도 조용히 사라지고 있었다.
 *
 * 앱(iOS·Android)에서는 그대로 네이티브 Alert 을, 웹에서는 브라우저 기본
 * confirm/alert 을 쓴다. 호출부는 플랫폼을 신경 쓰지 않는다.
 */

/** 예/아니오 확인. 사용자가 확인을 누르면 true. */
export function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // window 가 없는 렌더 환경(SSR·프리렌더)에서는 진행하지 않는 쪽이 안전하다.
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.resolve(false);
    }
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel', onPress: () => resolve(false) },
      { text: '확인', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** 결과 안내(선택지 없음). */
export function alertDialog(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
