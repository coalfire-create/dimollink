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
  Checkbox,
  SegmentedButtons,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { PILOT, PLATFORM_FEE_RATE } from '@dimol/shared';

const brandTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#3B82F6',
    secondary: '#1E3A8A',
    background: '#F3F4F6',
    surface: '#ffffff',
    error: '#EF4444',
  },
  roundness: 8,
};

type UserRole = 'discharger' | 'company' | null;
type DischargerTab = 'demolition' | 'transport' | 'disposal';

export default function App() {
  const [role, setRole] = useState<UserRole>(null);
  const [dischargerTab, setDischargerTab] = useState<DischargerTab>('demolition');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [wasteAmount, setWasteAmount] = useState('');
  const [loadingAddress, setLoadingAddress] = useState('');
  const [unloadingAddress, setUnloadingAddress] = useState('');

  const [isAllbaroRequired, setIsAllbaroRequired] = useState(false);
  const [isOver5Tons, setIsOver5Tons] = useState(false);
  const [isCompanyAllbaroCertified, setIsCompanyAllbaroCertified] = useState(false);

  const handleSelectRole = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === null) {
      setSelectedImage(null);
      setAddress('');
      setDescription('');
      setVisitDate('');
      setWasteAmount('');
      setLoadingAddress('');
      setUnloadingAddress('');
      setIsAllbaroRequired(false);
      setIsOver5Tons(false);
      setDischargerTab('demolition');
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const handleSubmitRequest = () => {
    if (!address.trim()) {
      Alert.alert('알림', '현장 주소를 입력해주세요.');
      return;
    }
    Alert.alert('견적 요청 완료', '성공적으로 철거 및 수거 견적이 요청되었습니다!');
    handleSelectRole(null);
  };

  const handleDisposalRequest = () => {
    if (!visitDate.trim() || !wasteAmount.trim()) {
      Alert.alert('알림', '방문 일시와 폐기물 정보를 모두 입력해주세요.');
      return;
    }
    Alert.alert('예약 신청 완료', '처리장 예약이 접수되었습니다!');
    handleSelectRole(null);
  };

  const handleTransportRequest = () => {
    if (!loadingAddress.trim() || !unloadingAddress.trim()) {
      Alert.alert('알림', '상차지 주소와 하차지 주소를 모두 입력해주세요.');
      return;
    }
    Alert.alert('운반 요청 완료', '성공적으로 운반 및 배차 견적이 요청되었습니다!');
    handleSelectRole(null);
  };

  const renderAllbaroSection = () => (
    <Card style={styles.allbaroCard} mode="outlined">
      <Card.Content>
        <TouchableOpacity 
          style={styles.checkboxRow} 
          onPress={() => setIsAllbaroRequired(!isAllbaroRequired)}
        >
          <Checkbox status={isAllbaroRequired ? 'checked' : 'unchecked'} color={brandTheme.colors.primary} />
          <Text style={styles.checkboxText}>올바로 전자인계서 신고가 필요한 건인가요?</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.checkboxRow} 
          onPress={() => {
            const nextValue = !isOver5Tons;
            setIsOver5Tons(nextValue);
            if (nextValue) {
              Alert.alert(
                '안내',
                '건설폐기물이 5톤 이상인 경우, 법적으로 올바로시스템을 통한 전자인계서 작성이 의무화되어 있습니다.\n해당 건은 올바로 신고 대상으로 자동 지정됩니다.'
              );
              setIsAllbaroRequired(true);
            }
          }}
        >
          <Checkbox status={isOver5Tons ? 'checked' : 'unchecked'} color={brandTheme.colors.primary} />
          <Text style={styles.checkboxText}>건설폐기물 5톤 이상인가요?</Text>
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );

  return (
    <PaperProvider theme={brandTheme}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.webAppWrapper}>
          
          {/* Global Header */}
          <Surface style={styles.header} elevation={1}>
            <Text style={styles.headerLogo}>DEMOLINK</Text>
            <View style={styles.headerProfile}><Text style={{ fontSize: 24 }}>👤</Text></View>
          </Surface>

          <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
            {role === null ? (
              // Onboarding Screen
              <View style={styles.onboarding}>
                <Card style={styles.welcomeBanner} mode="contained">
                  <Card.Content>
                    <Text style={styles.welcomeTitle}>🔔 환영합니다!</Text>
                    <Text style={styles.welcomeDesc}>디몰링크와 함께 편리한 철거 및 폐기물 처리 서비스를 이용해보세요.</Text>
                  </Card.Content>
                </Card>

                <Card style={styles.roleCard} mode="elevated" onPress={() => handleSelectRole('discharger')}>
                  <Card.Content style={styles.roleCardContent}>
                    <Text style={styles.roleIcon}>🗑️</Text>
                    <View style={styles.roleTextWrapper}>
                      <Text style={styles.roleTitle}>폐기물 버리기</Text>
                      <Text style={styles.roleDesc}>집이나 현장의 폐기물을 치우고 버리는 분</Text>
                    </View>
                  </Card.Content>
                </Card>

                <Card style={styles.roleCard} mode="elevated" onPress={() => handleSelectRole('company')}>
                  <Card.Content style={styles.roleCardContent}>
                    <Text style={styles.roleIcon}>🚚</Text>
                    <View style={styles.roleTextWrapper}>
                      <Text style={styles.roleTitle}>일감 찾기</Text>
                      <Text style={styles.roleDesc}>철거·운반·처리 업체를 운영하며 일거리를 찾는 분</Text>
                    </View>
                  </Card.Content>
                </Card>
              </View>
            ) : (
              // Main Screens
              <View style={styles.mainContent}>
                {role === 'discharger' ? (
                  <View style={styles.formContainer}>
                    <SegmentedButtons
                      value={dischargerTab}
                      onValueChange={(val) => setDischargerTab(val as DischargerTab)}
                      buttons={[
                        { value: 'demolition', label: '철거 요청' },
                        { value: 'transport', label: '운반 요청' },
                        { value: 'disposal', label: '처리장 예약' },
                      ]}
                      style={{ marginBottom: 24 }}
                    />

                    <Text style={styles.sectionTitle}>1. 현장/폐기물 사진 등록</Text>
                    <TouchableOpacity style={styles.imageUploadBox} onPress={handlePickImage} activeOpacity={0.8}>
                      {selectedImage ? (
                        <Image source={{ uri: selectedImage }} style={styles.uploadedImage} />
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 40, marginBottom: 8 }}>📸</Text>
                          <Text style={{ fontSize: 18, color: '#60A5FA' }}>여기를 눌러 사진 추가하기</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {dischargerTab === 'demolition' && (
                      <View>
                        <Text style={styles.sectionTitle}>2. 현장 주소 입력</Text>
                        <TextInput mode="outlined" placeholder="주소를 입력하세요" value={address} onChangeText={setAddress} style={styles.input} />
                        <Text style={styles.sectionTitle}>3. 상세 요청 사항 (선택)</Text>
                        <TextInput mode="outlined" placeholder="상세 내용을 적어주세요" value={description} onChangeText={setDescription} multiline numberOfLines={3} style={styles.input} />
                        {renderAllbaroSection()}
                        <Button mode="contained" onPress={handleSubmitRequest} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel} style={styles.actionButton}>견적 요청하기</Button>
                      </View>
                    )}

                    {dischargerTab === 'transport' && (
                      <View>
                        <Text style={styles.sectionTitle}>2. 상차지 및 하차지 주소</Text>
                        <TextInput mode="outlined" placeholder="상차지 주소 (출발지)" value={loadingAddress} onChangeText={setLoadingAddress} style={styles.input} />
                        <TextInput mode="outlined" placeholder="하차지 주소 (도착지)" value={unloadingAddress} onChangeText={setUnloadingAddress} style={styles.input} />
                        <Text style={styles.sectionTitle}>3. 상세 요청 사항 (선택)</Text>
                        <TextInput mode="outlined" placeholder="폐기물 무게, 차종 등" value={description} onChangeText={setDescription} multiline numberOfLines={3} style={styles.input} />
                        {renderAllbaroSection()}
                        <Button mode="contained" onPress={handleTransportRequest} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel} style={styles.actionButton}>운반 견적 요청하기</Button>
                      </View>
                    )}

                    {dischargerTab === 'disposal' && (
                      <View>
                        <Text style={styles.sectionTitle}>2. 방문 예정 일시</Text>
                        <TextInput mode="outlined" placeholder="예) 10월 25일 오후 2시" value={visitDate} onChangeText={setVisitDate} style={styles.input} />
                        <Text style={styles.sectionTitle}>3. 폐기물 종류 및 무게</Text>
                        <TextInput mode="outlined" placeholder="예) 혼합건설폐기물 2.5톤" value={wasteAmount} onChangeText={setWasteAmount} style={styles.input} />
                        {renderAllbaroSection()}
                        <Button mode="contained" onPress={handleDisposalRequest} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel} style={styles.actionButton}>예약 신청하기</Button>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.companyProfile}>
                    <View style={styles.companyHeader}>
                      <Text style={styles.companyName}>디몰링크 파트너스</Text>
                      {isCompanyAllbaroCertified && (
                        <Surface style={styles.badge} elevation={0}>
                          <Text style={styles.badgeText}>🏆 올바로 인증 업체</Text>
                        </Surface>
                      )}
                    </View>
                    
                    <Card style={styles.allbaroCard} mode="outlined">
                      <Card.Content>
                        <TouchableOpacity style={styles.checkboxRow} onPress={() => setIsCompanyAllbaroCertified(!isCompanyAllbaroCertified)}>
                          <Checkbox status={isCompanyAllbaroCertified ? 'checked' : 'unchecked'} color={brandTheme.colors.primary} />
                          <Text style={styles.checkboxText}>올바로 시스템 인증 여부 (테스트 토글)</Text>
                        </TouchableOpacity>
                      </Card.Content>
                    </Card>

                    <Card style={{ backgroundColor: '#F8FAFC', marginBottom: 24 }}>
                      <Card.Content>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>📍 서비스 정보</Text>
                        <Text style={{ fontSize: 18, marginBottom: 8 }}>파일럿 지역: {PILOT.region}</Text>
                        <Text style={{ fontSize: 18 }}>플랫폼 수수료: {PLATFORM_FEE_RATE * 100}%</Text>
                      </Card.Content>
                    </Card>
                  </View>
                )}

                <Button mode="outlined" onPress={() => handleSelectRole(null)} contentStyle={styles.buttonContent} labelStyle={{ fontSize: 18, fontWeight: 'bold' }}>
                  🔄 처음으로 돌아가기
                </Button>
              </View>
            )}
          </ScrollView>

          {/* Bottom Tab Bar */}
          <Surface style={styles.bottomTabBar} elevation={4}>
            <View style={styles.tabItem}><Text style={styles.tabIconActive}>🏠</Text><Text style={styles.tabLabelActive}>홈</Text></View>
            <View style={styles.tabItem}><Text style={styles.tabIcon}>🕒</Text><Text style={styles.tabLabel}>내역</Text></View>
            <View style={styles.tabItem}><Text style={styles.tabIcon}>🔔</Text><Text style={styles.tabLabel}>알림</Text></View>
            <View style={styles.tabItem}><Text style={styles.tabIcon}>⚙️</Text><Text style={styles.tabLabel}>설정</Text></View>
          </Surface>
        </View>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E5E7EB' },
  webAppWrapper: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#ffffff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, backgroundColor: '#ffffff' },
  headerLogo: { fontSize: 28, fontWeight: '900', color: '#1E3A8A' },
  headerProfile: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  scrollContainer: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  
  onboarding: { flex: 1 },
  welcomeBanner: { backgroundColor: '#EFF6FF', marginBottom: 32 },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', color: '#1E40AF', marginBottom: 16 },
  welcomeDesc: { fontSize: 18, color: '#3B82F6', lineHeight: 28 },
  
  roleCard: { marginBottom: 24, backgroundColor: '#ffffff' },
  roleCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  roleIcon: { fontSize: 40, marginRight: 16 },
  roleTextWrapper: { flex: 1 },
  roleTitle: { fontSize: 24, fontWeight: 'bold', color: '#1E3A8A', marginBottom: 8 },
  roleDesc: { fontSize: 18, color: '#4B5563' },

  mainContent: { flex: 1 },
  formContainer: { flex: 1, paddingBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#374151', marginBottom: 16, marginTop: 16 },
  
  input: { backgroundColor: '#ffffff', marginBottom: 24, fontSize: 18 },
  
  imageUploadBox: { backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 8, height: 160, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  uploadedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  allbaroCard: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', marginBottom: 32 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkboxText: { fontSize: 18, color: '#1F2937', flex: 1, marginLeft: 8 },
  
  actionButton: { marginTop: 16, marginBottom: 32 },
  buttonContent: { height: 56 },
  buttonLabel: { fontSize: 20, fontWeight: 'bold' },

  companyProfile: { flex: 1, paddingBottom: 16 },
  companyHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 },
  companyName: { fontSize: 28, fontWeight: 'bold', marginRight: 16, color: '#1F2937' },
  badge: { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  badgeText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  bottomTabBar: { flexDirection: 'row', backgroundColor: '#ffffff', paddingBottom: 32, paddingTop: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 28, color: '#9CA3AF', marginBottom: 8 },
  tabIconActive: { fontSize: 28, color: '#3B82F6', marginBottom: 8 },
  tabLabel: { fontSize: 16, color: '#9CA3AF' },
  tabLabelActive: { fontSize: 16, fontWeight: 'bold', color: '#3B82F6' },
});
