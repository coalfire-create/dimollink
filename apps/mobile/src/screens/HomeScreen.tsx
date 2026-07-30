import React from 'react';
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
    case 'INTERIOR_COMPANY': return <InteriorHomeScreen />;
    default: return <ConsumerHomeScreen />;
  }
}
