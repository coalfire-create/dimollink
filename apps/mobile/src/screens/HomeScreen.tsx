import React, { useState } from 'react';
import type { UserProfile } from '@dimol/shared';
import { SessionContext, useSession } from '../navigation';
import { ConsumerHomeScreen } from './ConsumerHomeScreen';
import { DemolitionHomeScreen } from './DemolitionHomeScreen';
import { TransportHomeScreen } from './TransportHomeScreen';
import { TreatmentPlantHomeScreen } from './TreatmentPlantHomeScreen';
import { InteriorHomeScreen } from './InteriorHomeScreen';
import { GuestHomeScreen } from './GuestHomeScreen';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const MOCK_USERS: Record<string, UserProfile> = {
  CONSUMER: {
    id: '393930e9-8f6a-4271-821d-0f0080ed0ddb',
    userType: 'CONSUMER',
    name: 'Lee Jung Han',
    region: '양평',
    phone: '010-1234-5678',
    approvalStatus: 'APPROVED',
    allbaroCertified: false,
    insuranceRegistered: false,
    permitRegistered: false,
    createdAt: '2026-07-10T17:45:08.839Z',
    updatedAt: '2026-07-10T17:45:08.839Z',
  },
  DEMOLITION_COMPANY: {
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
  TRANSPORT_COMPANY: {
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
  WASTE_TREATMENT_PLANT: {
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
  INTERIOR_COMPANY: {
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

export function HomeScreen() {
  const user = useSession();
  const [overrideRole, setOverrideRole] = useState<string | null>(null);

  const activeRole = overrideRole || user?.userType || 'CONSUMER';
  const currentMockUser = overrideRole ? MOCK_USERS[overrideRole] || user : user;

  const roles = [
    { key: 'CONSUMER', label: '소비자(일반)' },
    { key: 'DEMOLITION_COMPANY', label: '철거 업체' },
    { key: 'INTERIOR_COMPANY', label: '인테리어' },
    { key: 'TRANSPORT_COMPANY', label: '운반 업체' },
    { key: 'WASTE_TREATMENT_PLANT', label: '폐기물 처리장' },
    { key: 'GUEST', label: '게스트' },
  ];

  function renderContent() {
    switch (activeRole) {
      case 'CONSUMER':
        return <ConsumerHomeScreen />;
      case 'DEMOLITION_COMPANY':
        return <DemolitionHomeScreen />;
      case 'TRANSPORT_COMPANY':
        return <TransportHomeScreen />;
      case 'WASTE_TREATMENT_PLANT':
        return <TreatmentPlantHomeScreen />;
      case 'INTERIOR_COMPANY':
        return <InteriorHomeScreen />;
      case 'GUEST':
        return (
          <GuestHomeScreen
            onLogin={() => {}}
            onSignup={() => {}}
          />
        );
      default:
        return <ConsumerHomeScreen />;
    }
  }

  return (
    <SessionContext.Provider value={currentMockUser}>
      <View style={styles.container}>
        <View style={styles.switcherHeader}>
          <Text style={styles.switcherTitle}>💡 개발용 화면 전환 스위처 (역할을 선택하세요):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
            {roles.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.roleChip, activeRole === r.key && styles.roleChipActive]}
                onPress={() => setOverrideRole(r.key)}
              >
                <Text style={[styles.roleText, activeRole === r.key && styles.roleTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.contentArea}>
          {renderContent()}
        </View>
      </View>
    </SessionContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  switcherHeader: {
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    zIndex: 9999,
  },
  switcherTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  switcherScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  roleChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  roleText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  roleTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  contentArea: {
    flex: 1,
  },
});


