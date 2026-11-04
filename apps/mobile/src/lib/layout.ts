import { Platform, useWindowDimensions } from 'react-native';
import { WIDE_LAYOUT_BREAKPOINT } from '@dimol/shared';

/**
 * 데스크톱 웹 화면인지 — 웹이면서 브라우저 폭이 넓을 때만 true.
 *
 * 네이티브 앱은 태블릿이어도 항상 false(모바일 레이아웃 그대로). 창 크기를 바꾸면
 * 다시 그려지도록 useWindowDimensions 로 읽는다.
 */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_LAYOUT_BREAKPOINT;
}
