import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  ScrollView,
  Image,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  MD3LightTheme,
  PaperProvider,
  Button,
  TextInput,
  Card,
  Text,
  Surface,
  ProgressBar,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Theme Configuration
const brandTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1E88E5', // DEMOLINK Blue
    secondary: '#10B981', // Green for transport
    background: '#ffffff',
    surface: '#ffffff',
  },
  roundness: 12,
};

type Role = 'discharger' | 'demolition_company' | 'disposal_company' | null;
type DischargerScreen = 'dashboard' | 'form' | 'matchingStatus' | 'transportMatch' | 'complete' | 'history' | 'notification' | 'mypage';
type CompanyScreen = 'dashboard' | 'history' | 'notification' | 'mypage';

export default function App() {
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [authScreen, setAuthScreen] = useState<'login' | 'signup_role' | 'signup_form'>('login');
  
  // Mock DB for accounts: { [username]: Role }
  const [users, setUsers] = useState<Record<string, Role>>({
    'test': 'discharger',
    'company': 'demolition_company',
  });
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  
  const [signupId, setSignupId] = useState('');
  const [signupPw, setSignupPw] = useState('');
  const [signupRole, setSignupRole] = useState<Role>(null);
  
  // Discharger State
  const [dScreen, setDScreen] = useState<DischargerScreen>('dashboard');
  const [formType, setFormType] = useState<'demolition' | 'transport' | 'disposal'>('demolition');
  
  // Form State
  const [taskName, setTaskName] = useState('');
  const [address, setAddress] = useState('');
  const [wasteType, setWasteType] = useState('');
  const [date, setDate] = useState('');
  const [specialNote, setSpecialNote] = useState('');

  // -------------------------------------------------------------
  // Components
  // -------------------------------------------------------------
  
  const Header = () => (
    <View style={styles.header}>
      <Text style={styles.logoText}>비움</Text>
      {isLoggedIn && role && (
        <View style={styles.headerIcons}>
          <TouchableOpacity style={{ marginRight: 16 }}><MaterialCommunityIcons name="bell-outline" size={26} color="#374151" /></TouchableOpacity>
          <TouchableOpacity onPress={() => { 
            setRole(null); 
            setIsLoggedIn(false); 
            setAuthScreen('login');
            setLoginId('');
            setLoginPw('');
          }}><MaterialCommunityIcons name="logout" size={26} color="#374151" /></TouchableOpacity>
        </View>
      )}
    </View>
  );

  const BottomTabBar = () => (
    <Surface style={styles.bottomTabBar} elevation={5}>
      <TouchableOpacity style={styles.tabItem} onPress={() => setDScreen('dashboard')}>
        <MaterialCommunityIcons name="home" size={28} color={dScreen === 'dashboard' ? '#1E88E5' : '#9CA3AF'} />
        <Text style={dScreen === 'dashboard' ? styles.tabLabelActive : styles.tabLabel}>홈</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => setDScreen('history')}>
        <MaterialCommunityIcons name="history" size={28} color={dScreen === 'history' ? '#1E88E5' : '#9CA3AF'} />
        <Text style={dScreen === 'history' ? styles.tabLabelActive : styles.tabLabel}>내역</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => setDScreen('notification')}>
        <MaterialCommunityIcons name="bell-outline" size={28} color={dScreen === 'notification' ? '#1E88E5' : '#9CA3AF'} />
        <Text style={dScreen === 'notification' ? styles.tabLabelActive : styles.tabLabel}>알림</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => setDScreen('mypage')}>
        <MaterialCommunityIcons name="account-outline" size={28} color={dScreen === 'mypage' ? '#1E88E5' : '#9CA3AF'} />
        <Text style={dScreen === 'mypage' ? styles.tabLabelActive : styles.tabLabel}>MY</Text>
      </TouchableOpacity>
    </Surface>
  );

  // -------------------------------------------------------------
  // Screens: Auth Flow (Login & Signup)
  // -------------------------------------------------------------
  const handleLogin = () => {
    if (!loginId) return Alert.alert('알림', '아이디를 입력해주세요.\n(테스트용: test 또는 company)');
    if (users[loginId]) {
      setRole(users[loginId]);
      setIsLoggedIn(true);
    } else {
      Alert.alert('로그인 실패', '가입되지 않은 아이디입니다. 회원가입을 진행해주세요.');
    }
  };

  const handleSignup = () => {
    if (!signupId || !signupPw) return Alert.alert('알림', '아이디와 비밀번호를 모두 입력해주세요.');
    if (users[signupId]) return Alert.alert('알림', '이미 존재하는 아이디입니다.');
    
    // Save to mock DB and login automatically
    setUsers({ ...users, [signupId]: signupRole });
    setRole(signupRole);
    setIsLoggedIn(true);
    Alert.alert('가입 완료', '회원가입이 완료되었습니다!');
  };

  const renderLogin = () => (
    <View style={styles.centerContainer}>
      <Text style={{ fontSize: 44, fontWeight: '900', color: '#1E88E5', marginBottom: 12, letterSpacing: 1 }}>비움</Text>
      <Text style={{ fontSize: 16, color: '#4B5563', marginBottom: 48, fontWeight: 'bold' }}>철거를 더 쉽고, 더 똑똑하게</Text>
      
      <View style={{ width: '100%', marginBottom: 32 }}>
        <TextInput mode="outlined" label="아이디 (이메일)" value={loginId} onChangeText={setLoginId} autoCapitalize="none" style={{ backgroundColor: '#ffffff', marginBottom: 16 }} />
        <TextInput mode="outlined" label="비밀번호" value={loginPw} onChangeText={setLoginPw} secureTextEntry style={{ backgroundColor: '#ffffff', marginBottom: 24 }} />
        <Button mode="contained" contentStyle={{ height: 56 }} labelStyle={{ fontSize: 18, fontWeight: 'bold' }} onPress={handleLogin}>
          로그인
        </Button>
        <Button mode="text" style={{ marginTop: 8 }} labelStyle={{ fontSize: 16, fontWeight: 'bold' }} onPress={() => setAuthScreen('signup_role')}>
          회원가입하기
        </Button>
      </View>

      <View style={{ width: '100%', gap: 12 }}>
        <Button mode="outlined" icon="google" contentStyle={{ height: 56 }} textColor="#4B5563" style={{ borderColor: '#D1D5DB' }} onPress={() => { setLoginId('test'); handleLogin(); }}>
          Google 계정으로 로그인 (데모)
        </Button>
        <Button mode="contained" icon="chat" buttonColor="#FEE500" textColor="#374151" contentStyle={{ height: 56 }} onPress={() => { setLoginId('company'); handleLogin(); }}>
          카카오톡으로 로그인 (데모)
        </Button>
      </View>
    </View>
  );

  const renderSignupRole = () => (
    <View style={styles.centerContainer}>
      <TouchableOpacity style={{ alignSelf: 'flex-start', marginBottom: 24 }} onPress={() => setAuthScreen('login')}>
        <MaterialCommunityIcons name="arrow-left" size={32} color="#374151" />
      </TouchableOpacity>
      
      <Text style={{ fontSize: 28, marginBottom: 32, color: '#111827', fontWeight: 'bold' }}>회원가입: 역할을 선택해주세요</Text>
      
      <Card style={styles.roleCard} onPress={() => { setSignupRole('discharger'); setAuthScreen('signup_form'); }}>
        <Card.Content style={styles.roleCardContent}>
          <MaterialCommunityIcons name="account-hard-hat" size={40} color="#1E88E5" />
          <View style={{ marginLeft: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>의뢰인 (배출자)</Text>
            <Text style={{ color: '#6B7280', marginTop: 4, fontSize: 14 }}>철거, 운반, 처리장을 찾습니다</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.roleCard} onPress={() => { setSignupRole('demolition_company'); setAuthScreen('signup_form'); }}>
        <Card.Content style={styles.roleCardContent}>
          <MaterialCommunityIcons name="hammer-wrench" size={40} color="#F59E0B" />
          <View style={{ marginLeft: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>철거 업체</Text>
            <Text style={{ color: '#6B7280', marginTop: 4, fontSize: 14 }}>철거 일감을 찾고, 철거 폐기물 처리장을 찾습니다.</Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.roleCard} onPress={() => { setSignupRole('disposal_company'); setAuthScreen('signup_form'); }}>
        <Card.Content style={styles.roleCardContent}>
          <MaterialCommunityIcons name="delete-restore" size={40} color="#10B981" />
          <View style={{ marginLeft: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>폐기물 처리 / 운반 업체</Text>
            <Text style={{ color: '#6B7280', marginTop: 4, fontSize: 14 }}>처리장 및 차량 운행을 관리합니다</Text>
          </View>
        </Card.Content>
      </Card>
    </View>
  );

  const renderSignupForm = () => (
    <View style={styles.centerContainer}>
      <TouchableOpacity style={{ alignSelf: 'flex-start', marginBottom: 24 }} onPress={() => setAuthScreen('signup_role')}>
        <MaterialCommunityIcons name="arrow-left" size={32} color="#374151" />
      </TouchableOpacity>
      
      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1E88E5', marginBottom: 8 }}>계정 정보 입력</Text>
      <Text style={{ fontSize: 16, color: '#6B7280', marginBottom: 32 }}>
        선택한 역할: <Text style={{ fontWeight: 'bold', color: '#111827' }}>
          {signupRole === 'discharger' ? '의뢰인' : signupRole === 'demolition_company' ? '철거 업체' : '처리/운반 업체'}
        </Text>
      </Text>

      <View style={{ width: '100%', marginBottom: 32 }}>
        <TextInput mode="outlined" label="사용할 아이디" value={signupId} onChangeText={setSignupId} autoCapitalize="none" style={{ backgroundColor: '#ffffff', marginBottom: 16 }} />
        <TextInput mode="outlined" label="비밀번호" value={signupPw} onChangeText={setSignupPw} secureTextEntry style={{ backgroundColor: '#ffffff', marginBottom: 24 }} />
        <Button mode="contained" contentStyle={{ height: 56 }} labelStyle={{ fontSize: 18, fontWeight: 'bold' }} onPress={handleSignup}>
          가입 완료 및 시작하기
        </Button>
      </View>
    </View>
  );

  // -------------------------------------------------------------
  // Screens: Discharger
  // -------------------------------------------------------------
  const renderDischargerDashboard = () => (
    <View style={styles.screenContainer}>
      {/* Banner */}
      <View style={styles.welcomeBanner}>
        <MaterialCommunityIcons name="bullhorn-outline" size={28} color="#1E88E5" style={{ marginBottom: 8 }} />
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>환영합니다!</Text>
        <Text style={{ fontSize: 16, color: '#4B5563', marginTop: 8, lineHeight: 24 }}>오늘도 비움(BIUM)과 함께 편리한 철거 및 폐기물 처리 서비스를 이용해보세요.</Text>
      </View>

      {/* Main Buttons */}
      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#1E88E5' }]} 
        activeOpacity={0.8}
        onPress={() => { setFormType('demolition'); setDScreen('form'); }}
      >
        <MaterialCommunityIcons name="hammer-wrench" size={32} color="#fff" style={{ marginRight: 16 }} />
        <Text style={styles.mainBtnText}>철거 의뢰하기</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#10B981' }]} 
        activeOpacity={0.8}
        onPress={() => { setFormType('transport'); setDScreen('form'); }}
      >
        <MaterialCommunityIcons name="truck-fast" size={32} color="#fff" style={{ marginRight: 16 }} />
        <Text style={styles.mainBtnText}>운반 의뢰하기</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#1E88E5' }]} 
        activeOpacity={0.8}
        onPress={() => { setFormType('disposal'); setDScreen('form'); }}
      >
        <MaterialCommunityIcons name="delete-outline" size={32} color="#1E88E5" style={{ marginRight: 16 }} />
        <Text style={[styles.mainBtnText, { color: '#1E88E5' }]}>폐기물 처리하기</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDischargerForm = () => (
    <View style={styles.screenContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <TouchableOpacity onPress={() => setDScreen('dashboard')} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#374151" />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>
          {formType === 'demolition' ? '철거 요청 등록' : formType === 'transport' ? '운반 요청 등록' : '처리장 예약'}
        </Text>
      </View>

      <Text style={styles.inputLabel}>작업 명</Text>
      <TextInput mode="outlined" placeholder="예: 강남 빌딩 철거" value={taskName} onChangeText={setTaskName} style={styles.input} />

      <Text style={styles.inputLabel}>현장 주소</Text>
      <TextInput mode="outlined" placeholder="도로명 주소 또는 지번 주소 입력" value={address} onChangeText={setAddress} style={styles.input} />

      <Text style={styles.inputLabel}>예상 폐기물량/유형</Text>
      <TextInput mode="outlined" placeholder="예: 5톤 혼합 폐기물 (콘크리트, 목재)" value={wasteType} onChangeText={setWasteType} style={styles.input} />

      <Text style={styles.inputLabel}>철거 날짜</Text>
      <TextInput mode="outlined" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} style={styles.input} />

      <Text style={styles.inputLabel}>특별 사항</Text>
      <TextInput mode="outlined" placeholder="추가적인 요구 사항이나 주의 사항을 입력하세요." multiline numberOfLines={4} value={specialNote} onChangeText={setSpecialNote} style={styles.input} />

      <Button 
        mode="contained" 
        style={styles.submitBtn} 
        contentStyle={{ height: 60 }} 
        labelStyle={{ fontSize: 20, fontWeight: 'bold' }}
        onPress={() => setDScreen(formType === 'transport' ? 'transportMatch' : 'matchingStatus')}
      >
        요청 제출
      </Button>
    </View>
  );

  const renderMatchingStatus = () => (
    <View style={styles.screenContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <TouchableOpacity onPress={() => setDScreen('form')} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#374151" />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>매칭 상태</Text>
      </View>

      {/* Progress Status */}
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1E88E5', marginBottom: 16 }}>🚀 현재 매칭 상태</Text>
      <Card style={{ marginBottom: 32 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Surface style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1E40AF' }}>매칭 진행 중</Text>
            </Surface>
            <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: 'bold' }}>50%</Text>
          </View>
          <ProgressBar progress={0.5} color="#1E88E5" style={{ height: 10, borderRadius: 5, marginBottom: 20 }} />
          <Text style={{ fontSize: 16, color: '#4B5563', lineHeight: 24 }}>
            현재 고객님의 요청에 맞는 최적의 철거 업체 및 폐기물 처리장을 탐색 중입니다. 매칭이 완료되면 자동으로 업데이트됩니다.
          </Text>
          <Button mode="outlined" style={{ marginTop: 20 }} labelStyle={{ fontSize: 16, fontWeight: 'bold' }}>매칭 프로세스 확인</Button>
        </Card.Content>
      </Card>

      {/* Matched Company */}
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>매칭된 업체</Text>
      <Card style={{ marginBottom: 20 }} mode="elevated">
        <Card.Content style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold' }}>대한철거 </Text>
              <Surface style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#92400E', fontSize: 12, fontWeight: 'bold' }}>제안 확인</Text></Surface>
            </View>
            <Text style={{ fontSize: 16, color: '#4B5563', marginBottom: 4 }}>📞 010-1234-5678</Text>
            <Text style={{ fontSize: 16, color: '#F59E0B', fontWeight: 'bold' }}>⭐ 평점: 4.8 / 5</Text>
          </View>
          <Button mode="contained" contentStyle={{ paddingHorizontal: 8, paddingVertical: 4 }} onPress={() => setDScreen('complete')}>연락하기</Button>
        </Card.Content>
      </Card>

      {/* Matched Disposal */}
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>매칭된 폐기물 처리장</Text>
      <Card style={{ marginBottom: 24 }} mode="elevated">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>에코재활용 센터 </Text>
            <Surface style={{ backgroundColor: '#E0E7FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#3730A3', fontSize: 12, fontWeight: 'bold' }}>경로 확인 필요</Text></Surface>
          </View>
          <Text style={{ fontSize: 16, color: '#4B5563', marginBottom: 4 }}>📍 서울시 강남구 테헤란로 123</Text>
          <Text style={{ fontSize: 16, color: '#4B5563', fontWeight: 'bold' }}>💰 예상 비용: 50,000원/톤</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
            <Button mode="contained" buttonColor="#1E88E5" contentStyle={{ paddingHorizontal: 16 }}>경로 확인</Button>
          </View>
        </Card.Content>
      </Card>
    </View>
  );

  const renderTransportMatch = () => (
    <View style={styles.screenContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <TouchableOpacity onPress={() => setDScreen('form')} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#374151" />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>운반업체 매칭</Text>
      </View>

      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>철거현장 위치</Text>
      <View style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, color: '#374151' }}>📍 서울 강남구 역삼동</Text>
      </View>

      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>폐기물 종류</Text>
      <View style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, marginBottom: 24 }}>
        <Text style={{ fontSize: 18, color: '#374151' }}>📦 건설 폐기물</Text>
      </View>

      <Button mode="contained" buttonColor="#1E88E5" contentStyle={{ height: 56 }} labelStyle={{ fontSize: 18 }} style={{ marginBottom: 32 }}>운반업체 찾기</Button>

      <View style={{ height: 180, backgroundColor: '#E5E7EB', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 32 }}>
        <MaterialCommunityIcons name="map-marker-path" size={64} color="#9CA3AF" />
        <Text style={{ color: '#6B7280', marginTop: 12, fontSize: 16 }}>지도 영역 (반경 10km)</Text>
      </View>

      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>근처 운반업체 (거리순)</Text>
      
      <Card style={{ marginBottom: 20 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>강남 폐기물 운반</Text>
            <Surface style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#065F46', fontSize: 14, fontWeight: 'bold' }}>총 120회 운행</Text></Surface>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 20 }}>
            <Text style={{ fontSize: 16, color: '#4B5563' }}>📍 5.2km</Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>₩ 150,000</Text>
          </View>
          <Button mode="contained" contentStyle={{ height: 48 }} onPress={() => setDScreen('complete')}>지급 요청하기</Button>
        </Card.Content>
      </Card>
      
      <Card style={{ marginBottom: 20 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>성동 운반 솔루션</Text>
            <Surface style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#065F46', fontSize: 14, fontWeight: 'bold' }}>총 85회 운행</Text></Surface>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 20 }}>
            <Text style={{ fontSize: 16, color: '#4B5563' }}>📍 8.1km</Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>₩ 180,000</Text>
          </View>
          <Button mode="contained" contentStyle={{ height: 48 }}>지급 요청하기</Button>
        </Card.Content>
      </Card>
    </View>
  );

  const renderComplete = () => (
    <View style={[styles.screenContainer, { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }]}>
      <MaterialCommunityIcons name="check-circle-outline" size={120} color="#1E88E5" style={{ marginBottom: 32 }} />
      <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1E88E5', marginBottom: 20 }}>예약이 완료되었습니다!</Text>
      <Text style={{ fontSize: 18, color: '#6B7280', marginBottom: 48, textAlign: 'center' }}>예약 내역은 마이페이지에서 확인하실 수 있습니다.</Text>

      <Card style={{ width: '100%', marginBottom: 40 }} mode="outlined">
        <Card.Content>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24 }}>예약 상세</Text>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>예약 번호</Text><Text style={styles.detailValue}>ABC-123456789</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>날짜</Text><Text style={styles.detailValue}>2026년 10월 01일</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>시간</Text><Text style={styles.detailValue}>오후 2:00</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailLabel}>서비스</Text><Text style={styles.detailValue}>{formType === 'transport' ? '폐기물 운반' : '철거 및 처리'}</Text></View>
        </Card.Content>
      </Card>

      <Button mode="contained" style={{ width: '100%' }} contentStyle={{ height: 64 }} labelStyle={{ fontSize: 20, fontWeight: 'bold' }} onPress={() => setDScreen('dashboard')}>
        예약 내역 확인
      </Button>
    </View>
  );

  // -------------------------------------------------------------
  // Screens: Demolition Company
  // -------------------------------------------------------------
  const renderDemolitionDashboard = () => (
    <View style={styles.screenContainer}>
      <View style={styles.welcomeBanner}>
        <MaterialCommunityIcons name="bullhorn-outline" size={28} color="#1E88E5" style={{ marginBottom: 8 }} />
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>철거 업체 파트너님, 환영합니다!</Text>
        <Text style={{ fontSize: 16, color: '#4B5563', marginTop: 8, lineHeight: 24 }}>새로운 철거 일감을 확인하거나, 현장의 폐기물을 처리할 처리장/운반차량을 찾아보세요.</Text>
      </View>

      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#F59E0B' }]} 
        activeOpacity={0.8}
        onPress={() => Alert.alert('알림', '새로운 철거 일감을 탐색합니다.')}
      >
        <MaterialCommunityIcons name="hammer-wrench" size={32} color="#fff" style={{ marginRight: 16 }} />
        <Text style={styles.mainBtnText}>새로운 철거 일감 찾기</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#1E88E5' }]} 
        activeOpacity={0.8}
        onPress={() => { setFormType('disposal'); setDScreen('form'); }}
      >
        <MaterialCommunityIcons name="delete-outline" size={32} color="#1E88E5" style={{ marginRight: 16 }} />
        <Text style={[styles.mainBtnText, { color: '#1E88E5' }]}>철거 폐기물 처리장 찾기</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.mainBtn, { backgroundColor: '#10B981' }]} 
        activeOpacity={0.8}
        onPress={() => { setFormType('transport'); setDScreen('form'); }}
      >
        <MaterialCommunityIcons name="truck-fast" size={32} color="#fff" style={{ marginRight: 16 }} />
        <Text style={styles.mainBtnText}>폐기물 운반 의뢰하기</Text>
      </TouchableOpacity>
    </View>
  );

  // -------------------------------------------------------------
  // Screens: Disposal/Transport Company (Driver)
  // -------------------------------------------------------------
  const renderCompanyDashboard = () => (
    <View style={styles.screenContainer}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 32, color: '#111827' }}>운행 대기 리스트</Text>
      
      {/* New Ride Request Card (PDF Page 4) */}
      <Card style={{ marginBottom: 24, borderColor: '#1E88E5', borderWidth: 2 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <MaterialCommunityIcons name="bell-ring" size={28} color="#1E88E5" />
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1E88E5', marginLeft: 12 }}>새로운 운행 요청이 도착했습니다!</Text>
          </View>
          
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, color: '#6B7280', width: 70 }}>출발지</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', flex: 1 }}>서울시 강남구 테헤란로 123</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 24 }}>
            <Text style={{ fontSize: 18, color: '#6B7280', width: 70 }}>도착지</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', flex: 1 }}>경기도 성남시 분당구 판교역로 235</Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, marginBottom: 32 }}>
            <Text style={{ fontSize: 16, color: '#374151', fontWeight: 'bold' }}>🏁 거리: 30 km</Text>
            <Text style={{ fontSize: 16, color: '#374151', fontWeight: 'bold' }}>⏱️ 시간: 45분</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Button mode="contained" buttonColor="#1E88E5" contentStyle={{ height: 60 }} labelStyle={{ fontSize: 20, fontWeight: 'bold' }} style={{ flex: 1 }} onPress={() => Alert.alert('수락 완료', '운행이 배정되었습니다.')}>수락</Button>
            <Button mode="outlined" textColor="#4B5563" contentStyle={{ height: 60 }} labelStyle={{ fontSize: 20, fontWeight: 'bold' }} style={{ flex: 1, borderColor: '#D1D5DB', borderWidth: 2 }} onPress={() => Alert.alert('거절 완료', '다른 기사님께 배차됩니다.')}>거절</Button>
          </View>
        </Card.Content>
      </Card>
      
    </View>
  );

  // -------------------------------------------------------------
  // Screens: Tab Bar Screens (History, Notification, MyPage)
  // -------------------------------------------------------------
  const renderHistory = () => (
    <View style={styles.screenContainer}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 24, color: '#111827' }}>이용 내역</Text>
      <Card style={{ marginBottom: 16 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Surface style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#065F46', fontSize: 14, fontWeight: 'bold' }}>완료</Text></Surface>
            <Text style={{ color: '#6B7280', fontSize: 14 }}>2026.06.15</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 6 }}>강남 빌딩 철거</Text>
          <Text style={{ color: '#4B5563', fontSize: 16 }}>철거 및 폐기물 처리 (5톤)</Text>
        </Card.Content>
      </Card>
      <Card style={{ marginBottom: 16 }} mode="outlined">
        <Card.Content>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Surface style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}><Text style={{ color: '#991B1B', fontSize: 14, fontWeight: 'bold' }}>취소됨</Text></Surface>
            <Text style={{ color: '#6B7280', fontSize: 14 }}>2026.06.10</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 6 }}>역삼동 인테리어 철거</Text>
          <Text style={{ color: '#4B5563', fontSize: 16 }}>폐기물 운반 단독</Text>
        </Card.Content>
      </Card>
    </View>
  );

  const renderNotification = () => (
    <View style={styles.screenContainer}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 24, color: '#111827' }}>알림</Text>
      <Card style={{ marginBottom: 16, backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1 }} mode="outlined">
        <Card.Content>
          <Text style={{ color: '#0369A1', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>방금 전</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>대한철거에서 견적을 보냈습니다!</Text>
          <Text style={{ color: '#4B5563', fontSize: 16 }}>매칭 상태를 확인하고 제안을 수락해보세요.</Text>
        </Card.Content>
      </Card>
      <Card style={{ marginBottom: 16 }} mode="outlined">
        <Card.Content>
          <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>1일 전</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>비움(BIUM) 가입을 환영합니다!</Text>
          <Text style={{ color: '#4B5563', fontSize: 16 }}>철거를 더 쉽고, 더 똑똑하게 시작해보세요.</Text>
        </Card.Content>
      </Card>
    </View>
  );

  const renderMyPage = () => (
    <View style={styles.screenContainer}>
      <Text style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 32, color: '#111827' }}>마이페이지</Text>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 40 }}>
        <MaterialCommunityIcons name="account-circle" size={80} color="#D1D5DB" />
        <View style={{ marginLeft: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827' }}>{loginId || signupId} 님</Text>
          <Text style={{ color: '#6B7280', marginTop: 4, fontSize: 16 }}>
            {role === 'discharger' ? '의뢰인' : role === 'demolition_company' ? '철거 업체' : '처리/운반 업체'}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 16 }}>계정 관리</Text>
      <TouchableOpacity style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: '#111827' }}>내 프로필 수정</Text>
        <MaterialCommunityIcons name="chevron-right" size={28} color="#9CA3AF" />
      </TouchableOpacity>
      <TouchableOpacity style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: '#111827' }}>결제 수단 관리</Text>
        <MaterialCommunityIcons name="chevron-right" size={28} color="#9CA3AF" />
      </TouchableOpacity>

      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 16, marginTop: 40 }}>고객 지원</Text>
      <TouchableOpacity style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: '#111827' }}>공지사항</Text>
        <MaterialCommunityIcons name="chevron-right" size={28} color="#9CA3AF" />
      </TouchableOpacity>
      <TouchableOpacity style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: '#111827' }}>자주 묻는 질문 (FAQ)</Text>
        <MaterialCommunityIcons name="chevron-right" size={28} color="#9CA3AF" />
      </TouchableOpacity>

      <Button 
        mode="outlined" 
        textColor="#EF4444" 
        contentStyle={{ height: 60 }}
        labelStyle={{ fontSize: 18, fontWeight: 'bold' }}
        style={{ marginTop: 48, borderColor: '#FCA5A5', borderWidth: 2 }} 
        onPress={() => { setRole(null); setIsLoggedIn(false); setAuthScreen('login'); setLoginId(''); setLoginPw(''); }}
      >
        로그아웃
      </Button>
    </View>
  );

  return (
    <PaperProvider theme={brandTheme}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.appWrapper}>
          <Header />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {!isLoggedIn && authScreen === 'login' && renderLogin()}
            {!isLoggedIn && authScreen === 'signup_role' && renderSignupRole()}
            {!isLoggedIn && authScreen === 'signup_form' && renderSignupForm()}
            
            {isLoggedIn && (
              <>
                {dScreen === 'dashboard' && role === 'discharger' && renderDischargerDashboard()}
                {dScreen === 'dashboard' && role === 'demolition_company' && renderDemolitionDashboard()}
                {dScreen === 'dashboard' && role === 'disposal_company' && renderCompanyDashboard()}
                {dScreen === 'form' && renderDischargerForm()}
                {dScreen === 'matchingStatus' && renderMatchingStatus()}
                {dScreen === 'transportMatch' && renderTransportMatch()}
                {dScreen === 'complete' && renderComplete()}
                {dScreen === 'history' && renderHistory()}
                {dScreen === 'notification' && renderNotification()}
                {dScreen === 'mypage' && renderMyPage()}
              </>
            )}
          </ScrollView>
          {isLoggedIn && role && <BottomTabBar />}
        </View>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  appWrapper: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#ffffff' },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  logoText: { fontSize: 26, fontWeight: '900', color: '#1E88E5', letterSpacing: 1 },
  headerIcons: { flexDirection: 'row' },
  scrollContent: { flexGrow: 1 },
  centerContainer: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  screenContainer: { flex: 1, padding: 24 },
  
  // Roles
  roleCard: { width: '100%', marginBottom: 20, backgroundColor: '#ffffff', borderColor: '#E5E7EB', borderWidth: 2, elevation: 0 },
  roleCardContent: { flexDirection: 'row', alignItems: 'center', padding: 24 },

  // Dashboard
  welcomeBanner: { backgroundColor: '#F0F9FF', padding: 24, borderRadius: 16, marginBottom: 32 },
  mainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 16, marginBottom: 20 },
  mainBtnText: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },

  // Forms
  inputLabel: { fontSize: 18, fontWeight: 'bold', color: '#374151', marginBottom: 12, marginTop: 20 },
  input: { backgroundColor: '#ffffff', marginBottom: 8, fontSize: 16 },
  submitBtn: { marginTop: 40, borderRadius: 12 },

  // Complete
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  detailLabel: { fontSize: 18, color: '#6B7280' },
  detailValue: { fontSize: 18, fontWeight: 'bold', color: '#111827' },

  // Bottom Tab Bar
  bottomTabBar: { flexDirection: 'row', paddingVertical: 16, paddingBottom: 32, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  tabItem: { flex: 1, alignItems: 'center' },
  tabLabel: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
  tabLabelActive: { fontSize: 14, color: '#1E88E5', marginTop: 8, fontWeight: 'bold' },
});
