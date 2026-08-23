import React from 'react';
import { FEATURE_INTERIOR } from '../featureFlags';
import { useSession } from '../navigation';
import { ConsumerHomeScreen } from './ConsumerHomeScreen';
import { DemolitionHomeScreen } from './DemolitionHomeScreen';
import { TransportHomeScreen } from './TransportHomeScreen';
import { TreatmentPlantHomeScreen } from './TreatmentPlantHomeScreen';
import { InteriorHomeScreen } from './InteriorHomeScreen';

export function HomeScreen() {
  const user = useSession();
  switch (user.userType) {
    case 'CONSUMER': return <ConsumerHomeScreen />;
    case 'DEMOLITION_COMPANY': return <DemolitionHomeScreen />;
    case 'TRANSPORT_COMPANY': return <TransportHomeScreen />;
    case 'WASTE_TREATMENT_PLANT': return <TreatmentPlantHomeScreen />;
    // 인테리어는 FEATURE_INTERIOR 가 꺼져 있으면 홈 자체를 띄우지 않는다.
    case 'INTERIOR_COMPANY':
      return FEATURE_INTERIOR ? <InteriorHomeScreen /> : <ConsumerHomeScreen />;
    default: return <ConsumerHomeScreen />;
  }
}
