/* global document */
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import { APP_BACKGROUND, COLORS } from '@dimol/shared';
import App from './App';

/**
 * 웹 전용 바탕 스타일 — 앱(네이티브)은 OS 글꼴·렌더링을 그대로 쓴다.
 *
 * - 글꼴: Pretendard. 기본값으로 두면 윈도우에서 맑은 고딕으로 그려져서, 같은 화면이
 *   맥/폰에서 볼 때와 전혀 다른(오래된) 서비스처럼 보였다. 업체 사무실 PC 는 대부분 윈도우다.
 *   react-native-web 은 글자마다 기본 클래스(css-text-…)로 시스템 글꼴을 박아 넣으므로 그
 *   클래스를 덮는다. 아이콘 글꼴은 인라인 style 로 들어와 이 규칙보다 우선한다.
 * - 한국어 어절 단위 줄바꿈: "전\n자인계서" 처럼 단어가 잘리던 것을 막는다.
 * - 키보드로 이동할 때만 보이는 초점 테두리, 옅은 스크롤바, 선택 영역 색.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href =
    'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
  document.head.appendChild(font);

  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = COLORS.background;
  document.head.appendChild(themeColor);

  const family =
    '"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
  const textClasses = ['css-text-', 'css-textHasAncestor-', 'css-textinput-']
    .map((c) => `[class*="${c}"]:not([class*="r-fontFamily"])`)
    .join(',');

  const style = document.createElement('style');
  style.textContent = [
    '*{word-break:keep-all;overflow-wrap:anywhere}',
    `html,body{background:${APP_BACKGROUND};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}`,
    `body,${textClasses}{font-family:${family}}`,
    `::selection{background:${COLORS.primarySoft};color:${COLORS.text}}`,
    `:focus-visible{outline:2px solid ${COLORS.primary};outline-offset:2px}`,
    '::-webkit-scrollbar{width:10px;height:10px}',
    `::-webkit-scrollbar-thumb{background:${COLORS.borderStrong};border-radius:8px;border:2px solid transparent;background-clip:content-box}`,
    '::-webkit-scrollbar-track{background:transparent}',
  ].join('\n');
  document.head.appendChild(style);
}

registerRootComponent(App);
