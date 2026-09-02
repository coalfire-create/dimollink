import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { ScreenHeader, useSession } from '../navigation';
import { theme } from '../theme';
import { API_BASE_URL } from '../api/client';
import type { GeoPoint } from '@dimol/shared';
import { LoadingView } from '../components/ui';

export function TrackingScreen({ requestId }: { requestId: string }) {
  const user = useSession();
  const isProvider = user !== 'guest' && user?.userType === 'TRANSPORT_COMPANY';
  const role = isProvider ? 'provider' : 'consumer';
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Determine WS URL from API URL (e.g. http://... -> ws://...)
    const wsProto = API_BASE_URL.startsWith('https') ? 'wss://' : 'ws://';
    const wsHost = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    const wsUrl = `${wsProto}${wsHost}/ws/tracking?requestId=${requestId}&role=${role}`;

    const socket = new WebSocket(wsUrl);
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
          }
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
      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}
      
      {!location ? (
        <LoadingView />
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
              <Text style={styles.markerText}>🚚</Text>
            </View>
          </Marker>
        </MapView>
      )}
      
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>
          {isProvider ? '위치 공유 중' : '실시간 트래킹 중'}
        </Text>
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
  errorContainer: {
    padding: theme.spacing.m,
    backgroundColor: theme.colors.error,
  },
  errorText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  markerBadge: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 5,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  markerText: {
    fontSize: 24,
  },
  infoBox: {
    padding: theme.spacing.l,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: Platform.OS === 'ios' ? 32 : theme.spacing.l,
  },
  infoTitle: {
    fontSize: theme.font.h4,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  infoSubtitle: {
    fontSize: theme.font.body,
    color: theme.colors.textMuted,
  }
});
