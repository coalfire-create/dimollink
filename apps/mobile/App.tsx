import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AuthSession, UserProfile } from '@dimol/shared';
import { getMe, logoutServer, setAuthToken, setOnUnauthorized } from './src/api/client';
import { parseAuthDeepLink } from './src/lib/social-auth';
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
import { FloatingSupportButton, LoadingView } from './src/components/ui';
import { ChatScreen } from './src/screens/ChatScreen';
import { EstimateScreen } from './src/screens/EstimateScreen';
import { GuestHomeScreen } from './src/screens/GuestHomeScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MyPageScreen } from './src/screens/MyPageScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { PaymentScreen } from './src/screens/PaymentScreen';
import { RequestDetailScreen } from './src/screens/RequestDetailScreen';
import { RequestFormScreen } from './src/screens/RequestFormScreen';
import { RequestListScreen } from './src/screens/RequestListScreen';
import { InteriorFormScreen } from './src/screens/InteriorFormScreen';
import { InteriorListScreen } from './src/screens/InteriorListScreen';
import { InteriorDetailScreen } from './src/screens/InteriorDetailScreen';
import { SiteAnalysisScreen } from './src/screens/SiteAnalysisScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';

/** 세션: 로그인 회원(UserProfile) / 게스트('guest') / 미진입(null). */
type Session = UserProfile | 'guest' | null;
/** 미진입(null) 상태에서 보여줄 인증 화면. */
type AuthRoute = 'welcome' | 'login' | 'signup' | 'admin';

/**
 * 앱 루트 — 진입 게이트(로그인/회원가입/둘러보기) + 탭/스택 내비게이션.
 * 로그인/회원가입해야 서비스 기능에 들어갈 수 있고, 둘러보기는 게스트 화면으로 분리.
 * 세션 토큰은 단말에 저장해 재실행 시 자동 로그인한다.
 */
const DEV_USERS: Record<string, UserProfile> = {
  CONSUMER: {
    id: '29b1ff65-e7c5-4975-9f6d-9b1f51b27040',
    userType: 'CONSUMER',
    name: '김양평 (개발/UI검증)',
    region: '양평',
    phone: '01011110001',
    approvalStatus: 'APPROVED',
    allbaroCertified: false,
    insuranceRegistered: false,
    permitRegistered: false,
    createdAt: '2026-07-03T00:35:26.443Z',
    updatedAt: '2026-07-03T00:35:26.443Z',
  },
  DEMOLITION: {
    id: 'test-demo-company-id',
    userType: 'DEMOLITION_COMPANY',
    name: '대한철거(테스트)',
    region: '양평',
    phone: '01022220002',
    businessNumber: '1234567890',
    approvalStatus: 'APPROVED',
    allbaroCertified: true,
    insuranceRegistered: true,
    permitRegistered: true,
    createdAt: '2026-07-03T05:00:00.000Z',
    updatedAt: '2026-07-03T05:00:00.000Z',
  },
  TRANSPORT: {
    id: 'test-trans-company-id',
    userType: 'TRANSPORT_COMPANY',
    name: '신속운반(테스트)',
    region: '양평',
    phone: '01033330003',
    businessNumber: '0987654321',
    approvalStatus: 'APPROVED',
    availability: 'ONLINE',
    allbaroCertified: true,
    insuranceRegistered: true,
    permitRegistered: true,
    createdAt: '2026-07-03T05:00:00.000Z',
    updatedAt: '2026-07-03T05:00:00.000Z',
  },
  TREATMENT: {
    id: 'test-disp-plant-id',
    userType: 'WASTE_TREATMENT_PLANT',
    name: '푸른처리장(테스트)',
    region: '양평',
    phone: '01044440004',
    businessNumber: '1122334455',
    approvalStatus: 'APPROVED',
    allbaroCertified: true,
    insuranceRegistered: true,
    permitRegistered: true,
    createdAt: '2026-07-03T05:00:00.000Z',
    updatedAt: '2026-07-03T05:00:00.000Z',
  },
  INTERIOR: {
    id: '9769ca44-afc5-42a8-9569-59e1e9a1b8c4',
    userType: 'INTERIOR_COMPANY',
    name: '가온인테리어(테스트)',
    region: '양평',
    phone: '01055550005',
    approvalStatus: 'APPROVED',
    allbaroCertified: false,
    insuranceRegistered: false,
    permitRegistered: false,
    createdAt: '2026-07-11T03:38:22.629Z',
    updatedAt: '2026-07-11T03:38:22.629Z',
  },
};

export default function App() {
  const [session, setSession] = useState<Session>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authRoute, setAuthRoute] = useState<AuthRoute>('welcome');
  const [pendingSocial, setPendingSocial] = useState<{ ticket: string; prefillName?: string } | null>(
    null,
  );
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<TabName>('home');
  const [stack, setStack] = useState<Route[]>([]);

  const handleDevRoleSelect = useCallback((roleKey: 'CONSUMER' | 'DEMOLITION' | 'TRANSPORT' | 'TREATMENT' | 'INTERIOR') => {
    setSession(DEV_USERS[roleKey]);
    setStack([]);
    setTab('home');
  }, []);

  // 자동 로그인 — 저장된 토큰으로 세션 복원. 실패/만료 시 게이트로.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await loadToken();
      if (saved) {
        try {
          const user = await getMe(saved);
          if (active) {
            setAuthToken(saved);
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
    setAuthToken(authSession.token);
    setToken(authSession.token);
    void saveToken(authSession.token);
    setSession(authSession.user);
  }, []);

  // 소셜 로그인 콜백 딥링크(dimollink://auth?...) 수신 — 로그인/회원가입 분기.
  useEffect(() => {
    async function handleUrl(url: string | null) {
      const result = url ? parseAuthDeepLink(url) : null;
      if (!result) return;
      if (result.status === 'login') {
        try {
          const user = await getMe(result.token);
          handleAuthenticated({ token: result.token, user });
        } catch {
          // 토큰이 무효/만료면 로그인 화면을 유지한다.
        }
      } else if (result.status === 'signup') {
        setSession(null);
        setPendingSocial({ ticket: result.ticket, prefillName: result.name });
        setAuthRoute('signup');
      }
    }
    const sub = Linking.addEventListener('url', (e) => void handleUrl(e.url));
    void Linking.getInitialURL().then(handleUrl);
    return () => sub.remove();
  }, [handleAuthenticated]);

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
        setAuthToken(null);
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

  // 세션 만료(401) 시 자동 로그아웃 — 게이트로 복귀.
  useEffect(() => {
    setOnUnauthorized(authActions.logout);
    return () => setOnUnauthorized(null);
  }, [authActions]);

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
        // 같은 요청폼 화면끼리 이동(예약→연계 운반요청)할 때 인스턴스 상태가 남지 않도록 key 로 remount.
        return (
          <RequestFormScreen
            key={`requestForm:${route.kind}:${route.prefill?.linkedRequestId ?? 'new'}`}
            kind={route.kind}
            prefill={route.prefill}
          />
        );
      case 'requestDetail':
        return <RequestDetailScreen requestId={route.requestId} />;
      case 'chat':
        return <ChatScreen requestId={route.requestId} />;
      case 'payment':
        return <PaymentScreen requestId={route.requestId} source={route.source ?? 'waste'} />;
      case 'estimate':
        return <EstimateScreen />;
      case 'siteAnalysis':
        return <SiteAnalysisScreen />;
      case 'interiorForm':
        return <InteriorFormScreen />;
      case 'interiorList':
        return <InteriorListScreen scope={route.scope} />;
      case 'interiorDetail':
        return <InteriorDetailScreen requestId={route.requestId} />;
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
              {/* 우하단 고객센터 플로팅 버튼 — 로그인 화면 위에 상시 노출(탭바 위). */}
              <FloatingSupportButton />
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
            onComplete={(s) => {
              setPendingSocial(null);
              handleAuthenticated(s);
            }}
            onBack={() => {
              setPendingSocial(null);
              setAuthRoute('welcome');
            }}
            onLogin={() => setAuthRoute('login')}
            social={pendingSocial ?? undefined}
          />
        );
      case 'admin':
        return <AdminScreen onBack={() => setAuthRoute('welcome')} />;
      case 'welcome':
      default:
        return (
          <WelcomeScreen
            onLogin={() => setAuthRoute('login')}
            onSignup={() => setAuthRoute('signup')}
            onGuest={() => setSession('guest')}
            onAdmin={() => setAuthRoute('admin')}
            onDevRoleSelect={__DEV__ ? handleDevRoleSelect : undefined}
          />
        );
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />
      {/* 개발 / UI 검증용 상단 빠른 스위처 바 — 프로덕션 빌드(__DEV__=false)에서는 렌더링되지 않는다. */}
      {__DEV__ ? (
        <View style={styles.devHeaderBar}>
          <Text style={styles.devHeaderTitle}>⚡️ UI 개발검증 스위처:</Text>
          <Pressable style={styles.devHeaderBtn} onPress={() => handleDevRoleSelect('CONSUMER')}>
            <Text style={styles.devHeaderBtnText}>👤소비자</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => handleDevRoleSelect('DEMOLITION')}>
            <Text style={styles.devHeaderBtnText}>🏗철거</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => handleDevRoleSelect('TRANSPORT')}>
            <Text style={styles.devHeaderBtnText}>🚚운반</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => handleDevRoleSelect('TREATMENT')}>
            <Text style={styles.devHeaderBtnText}>🏭처리장</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => handleDevRoleSelect('INTERIOR')}>
            <Text style={styles.devHeaderBtnText}>🛠인테리어</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => { setSession(null); setAuthRoute('admin'); }}>
            <Text style={styles.devHeaderBtnText}>⚙️관리자</Text>
          </Pressable>
          <Pressable style={styles.devHeaderBtn} onPress={() => { setSession(null); setAuthRoute('welcome'); }}>
            <Text style={styles.devHeaderBtnText}>🚪웰컴</Text>
          </Pressable>
        </View>
      ) : null}
      {booting ? <LoadingView /> : renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  devHeaderBar: {
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    flexWrap: 'wrap',
    zIndex: 9999,
  },
  devHeaderTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 2,
  },
  devHeaderBtn: {
    backgroundColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  devHeaderBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
});
