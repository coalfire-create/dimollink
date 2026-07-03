import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import type { AuthSession, UserProfile } from '@dimol/shared';
import { getMe, logoutServer } from './src/api/client';
import { clearToken, loadToken, saveToken } from './src/lib/session-storage';
import {
  AuthActionsContext,
  NavigationContext,
  SessionContext,
  type AuthActions,
  type Navigation,
  type Route,
  type TabName,
} from './src/navigation';
import { theme } from './src/theme';
import { LoadingView } from './src/components/ui';
import { ChatScreen } from './src/screens/ChatScreen';
import { EstimateScreen } from './src/screens/EstimateScreen';
import { GuestHomeScreen } from './src/screens/GuestHomeScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MyPageScreen } from './src/screens/MyPageScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { RequestFormScreen } from './src/screens/RequestFormScreen';
import { RequestListScreen } from './src/screens/RequestListScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';

/** 세션: 로그인 회원(UserProfile) / 게스트('guest') / 미진입(null). */
type Session = UserProfile | 'guest' | null;
/** 미진입(null) 상태에서 보여줄 인증 화면. */
type AuthRoute = 'welcome' | 'login' | 'signup';

/**
 * 앱 루트 — 진입 게이트(로그인/회원가입/둘러보기) + 탭/스택 내비게이션.
 * 로그인/회원가입해야 서비스 기능에 들어갈 수 있고, 둘러보기는 게스트 화면으로 분리.
 * 세션 토큰은 단말에 저장해 재실행 시 자동 로그인한다.
 */
export default function App() {
  const [session, setSession] = useState<Session>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authRoute, setAuthRoute] = useState<AuthRoute>('welcome');
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<TabName>('home');
  const [stack, setStack] = useState<Route[]>([]);

  // 자동 로그인 — 저장된 토큰으로 세션 복원. 실패/만료 시 게이트로.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await loadToken();
      if (saved) {
        try {
          const user = await getMe(saved);
          if (active) {
            setToken(saved);
            setSession(user);
          }
        } catch {
          await clearToken();
        }
      }
      if (active) setBooting(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // 로그인/회원가입 성공 — 토큰 저장 + 세션 진입.
  const handleAuthenticated = useCallback((authSession: AuthSession) => {
    setToken(authSession.token);
    void saveToken(authSession.token);
    setSession(authSession.user);
  }, []);

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

  const authActions = useMemo<AuthActions>(
    () => ({
      logout: () => {
        if (token) void logoutServer(token).catch(() => undefined);
        void clearToken();
        setToken(null);
        setStack([]);
        setTab('home');
        setAuthRoute('welcome');
        setSession(null);
      },
    }),
    [token],
  );

  const isMember = session !== null && session !== 'guest';

  // Android 하드웨어 뒤로가기: 푸시 화면이 있으면 pop, 탭 루트면 기본 동작(앱 종료).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isMember && stack.length > 0) {
        navigation.pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isMember, stack.length, navigation]);

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

  function renderBody() {
    // 로그인 회원 — 전체 서비스 접근.
    if (isMember) {
      return (
        <SessionContext.Provider value={session}>
          <AuthActionsContext.Provider value={authActions}>
            <NavigationContext.Provider value={navigation}>
              {renderScreen()}
            </NavigationContext.Provider>
          </AuthActionsContext.Provider>
        </SessionContext.Provider>
      );
    }

    // 게스트 — 둘러보기 전용 화면.
    if (session === 'guest') {
      return (
        <GuestHomeScreen
          onLogin={() => {
            setSession(null);
            setAuthRoute('login');
          }}
          onSignup={() => {
            setSession(null);
            setAuthRoute('signup');
          }}
        />
      );
    }

    // 미진입 — 진입 게이트.
    switch (authRoute) {
      case 'login':
        return (
          <LoginScreen
            onSuccess={handleAuthenticated}
            onSignup={() => setAuthRoute('signup')}
            onBack={() => setAuthRoute('welcome')}
          />
        );
      case 'signup':
        return (
          <OnboardingScreen
            onComplete={handleAuthenticated}
            onBack={() => setAuthRoute('welcome')}
            onLogin={() => setAuthRoute('login')}
          />
        );
      case 'welcome':
      default:
        return (
          <WelcomeScreen
            onLogin={() => setAuthRoute('login')}
            onSignup={() => setAuthRoute('signup')}
            onGuest={() => setSession('guest')}
          />
        );
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      {booting ? <LoadingView /> : renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
});
