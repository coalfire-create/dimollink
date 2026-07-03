import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import type { UserProfile } from '@dimol/shared';
import {
  NavigationContext,
  SessionContext,
  type Navigation,
  type Route,
  type TabName,
} from './src/navigation';
import { theme } from './src/theme';
import { ChatScreen } from './src/screens/ChatScreen';
import { EstimateScreen } from './src/screens/EstimateScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MyPageScreen } from './src/screens/MyPageScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { RequestFormScreen } from './src/screens/RequestFormScreen';
import { RequestListScreen } from './src/screens/RequestListScreen';

/**
 * 앱 루트 — 온보딩 게이트 + 탭/스택 내비게이션.
 * 세션은 메모리 보관(파일럿) — 로그인/영속 세션은 인증 기능(별도 브랜치)과 함께 붙인다.
 */
export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<TabName>('home');
  const [stack, setStack] = useState<Route[]>([]);

  const navigation = useMemo<Navigation>(
    () => ({
      push: (route) => setStack((prev) => [...prev, route]),
      pop: () => setStack((prev) => prev.slice(0, -1)),
      switchTab: (next) => {
        setStack([]);
        setTab(next);
      },
    }),
    [],
  );

  // Android 하드웨어 뒤로가기: 푸시 화면이 있으면 pop, 탭 루트면 기본 동작(앱 종료).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 0) {
        navigation.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, navigation]);

  function renderScreen() {
    const route: Route = stack[stack.length - 1] ?? { name: tab };
    switch (route.name) {
      case 'home':
        return <HomeScreen />;
      case 'requests':
        return <RequestListScreen />;
      case 'notifications':
        return <NotificationsScreen />;
      case 'mypage':
        return <MyPageScreen />;
      case 'requestForm':
        return <RequestFormScreen kind={route.kind} />;
      case 'requestDetail':
        return <RequestDetailScreen requestId={route.requestId} />;
      case 'chat':
        return <ChatScreen requestId={route.requestId} />;
      case 'estimate':
        return <EstimateScreen />;
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      {user ? (
        <SessionContext.Provider value={user}>
          <NavigationContext.Provider value={navigation}>
            {renderScreen()}
          </NavigationContext.Provider>
        </SessionContext.Provider>
      ) : (
        <OnboardingScreen onComplete={setUser} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
});
