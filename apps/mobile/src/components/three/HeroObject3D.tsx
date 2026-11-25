import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** 네이티브 앱에는 WebGL 장면을 띄우지 않는다 — 자리만 비워 둔다(웹은 HeroObject3D.web.tsx). */
export function HeroObject3D({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={style} />;
}
