/* global document */
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

// 웹: 한국어가 글자 단위로 줄바꿈돼 "전\n자인계서" 처럼 단어가 잘리던 것을 막는다
// (네이티브는 OS 가 어절 단위로 줄바꿈해 해당 없음).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = '*{word-break:keep-all;overflow-wrap:anywhere}';
  document.head.appendChild(style);
}

registerRootComponent(App);
