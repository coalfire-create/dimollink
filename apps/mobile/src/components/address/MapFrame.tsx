import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { theme } from '../../theme';

/**
 * 지도 표면 — 웹은 iframe, 네이티브는 WebView.
 *
 * 지도 문서는 서버가 카카오 키를 심어 서빙하는 **실제 URL** 이어야 한다. srcDoc 문자열로
 * 넣으면 문서 URL 이 about:srcdoc 이 되어 카카오 SDK 가 내부 리소스를 http 로 불러오다
 * Mixed Content 로 차단된다.
 *
 * memo 로 완전히 고정한다(비교 함수가 항상 true). 부모 상태(로딩·상세주소 등)가 바뀔 때마다
 * 리렌더되면 지도 DOM 이 통째로 다시 만들어져 사용자가 맞춰 둔 위치가 초기화된다.
 */
export interface MapFrameProps {
  mapUrl: string;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  webViewRef: React.MutableRefObject<WebView | null>;
  onNativeMessage: (event: WebViewMessageEvent) => void;
}

export const MapFrame = React.memo(
  function MapFrame({ mapUrl, iframeRef, webViewRef, onNativeMessage }: MapFrameProps) {
    if (Platform.OS === 'web') {
      return (
        <iframe
          ref={iframeRef}
          src={mapUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="지도"
          allow="geolocation"
        />
      );
    }
    return (
      <WebView
        ref={webViewRef}
        source={{ uri: mapUrl }}
        originWhitelist={['*']}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        scrollEnabled={false}
        onMessage={onNativeMessage}
      />
    );
  },
  () => true,
);

const styles = StyleSheet.create({
  map: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
});
