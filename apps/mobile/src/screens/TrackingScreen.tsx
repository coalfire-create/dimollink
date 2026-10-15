import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { ScreenHeader, useSession } from '../navigation';
import { AppIcon } from '../components/AppIcon';
import { theme } from '../theme';
import { API_BASE_URL } from '../api/client';
import type { GeoPoint } from '@dimol/shared';
import { EmptyState, ErrorBanner } from '../components/ui';

/**
 * 위치 공유 WebSocket 주소.
 *
 * 웹 운영 번들은 API 주소가 상대경로('/api')라 http 접두사를 떼는 방식으로는
 * 'ws:///ws/tracking' 같은 깨진 주소가 나왔다. 상대경로면 지금 페이지의 호스트를 쓴다.
 */
function trackingSocketUrl(requestId: string, role: string): string {
  const query = `/ws/tracking?requestId=${encodeURIComponent(requestId)}&role=${role}`;
  if (API_BASE_URL.startsWith('/') && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    return `${proto}${window.location.host}${query}`;
  }
  const proto = API_BASE_URL.startsWith('https') ? 'wss://' : 'ws://';
  const host = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '');
  return `${proto}${host}${query}`;
}

export function TrackingScreen({ requestId }: { requestId: string }) {
  const user = useSession();
  const isProvider = user.userType === 'TRANSPORT_COMPANY';
  const role = isProvider ? 'provider' : 'consumer';
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(trackingSocketUrl(requestId, role));
    ws.current = socket;

    socket.onopen = () => {
      console.log('[tracking] WebSocket connected');
    };

    socket.onmessage = (e) => {
      if (!isProvider) {
        try {
          const data = JSON.parse(e.data);
          setLocation(data.location);
        } catch (err) {
          console.error('[tracking] Invalid message', err);
        }
      }
    };

    socket.onerror = (e) => {
      console.error('[tracking] WebSocket error', e);
      setErrorMsg('네트워크 오류가 발생했습니다.');
    };

    socket.onclose = () => {
      console.log('[tracking] WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, [requestId, role, isProvider]);

  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    if (isProvider) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('위치 권한이 거부되었습니다.');
          return;
        }

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Send every 5 seconds
            distanceInterval: 10,
          },
          (loc) => {
            const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setLocation(coords);
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ location: coords }));
            }
          },
        );
      })();
    }
    return () => {
      if (locationSub) {
        locationSub.remove();
      }
    };
  }, [isProvider]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="실시간 위치" canGoBack />
      <ErrorBanner message={errorMsg} />
      {!location ? (
        // 차량이 아직 출발 전이면 위치가 오지 않는다 — 끝없는 로딩 대신 무엇을 기다리는지 알린다.
        <View style={styles.map}>
          <EmptyState
            icon="truck"
            title={isProvider ? '내 위치를 찾고 있어요' : '차량이 출발하면 위치가 보여요'}
            description={
              isProvider
                ? '위치 권한을 허용하면 고객에게 차량 위치가 전해져요.'
                : '이 화면을 켜 두면 출발하는 순간 지도에 바로 나타나요.'
            }
          />
        </View>
      ) : (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          region={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title="현재 위치"
            description={isProvider ? '내 차량 위치' : '운반 트럭 위치'}
          >
            <View style={styles.markerBadge}>
              <AppIcon name="truck" size={20} color={theme.colors.background} />
            </View>
          </Marker>
        </MapView>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{isProvider ? '위치 공유 중' : '실시간 트래킹 중'}</Text>
        <Text style={styles.infoSubtitle}>
          {isProvider
            ? '고객에게 차량의 실시간 위치를 전송하고 있습니다.'
            : '트럭의 실시간 위치를 지도에서 확인할 수 있습니다.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  map: {
    flex: 1,
  },
  markerBadge: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: theme.spacing.xs,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  infoBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: Platform.OS === 'ios' ? 32 : theme.spacing.md,
  },
  infoTitle: {
    fontSize: theme.font.bodyLarge,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  infoSubtitle: {
    fontSize: theme.font.body,
    color: theme.colors.textMuted,
  },
});
