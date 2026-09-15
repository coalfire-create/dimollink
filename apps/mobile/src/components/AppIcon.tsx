import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

export type IconName =
  | 'home'
  | 'requests'
  | 'notifications'
  | 'mypage'
  | 'camera'
  | 'document'
  | 'truck'
  | 'tools'
  | 'building'
  | 'check'
  | 'lock'
  | 'star'
  | 'settings'
  | 'phone'
  | 'sparkles'
  | 'location'
  | 'chat'
  | 'alert'
  | 'recycle'
  | 'hammer'
  | 'palette'
  | 'user'
  | 'image'
  | 'lightbulb'
  | 'shield'
  | 'card';

/**
 * 아이콘 하나의 정의. 기본은 Ionicons 이고, Ionicons 에 없는 글리프만 `material` 로 뺀다.
 *
 * 폐기물 운반 트럭과 재활용 표시는 Ionicons 에 없어서 각각 버스(bus)와
 * 새로고침 화살표(refresh-circle)로 대신하고 있었다. 운반 서비스의 대표 아이콘이
 * 버스면 사용자는 다른 서비스로 읽는다 — 뜻이 맞는 글리프가 있는 세트에서 가져온다.
 */
type IconGlyph =
  | { family?: 'ion'; outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }
  | {
      family: 'material';
      outline: keyof typeof MaterialCommunityIcons.glyphMap;
      filled: keyof typeof MaterialCommunityIcons.glyphMap;
    };

const ICON_MAP: Record<IconName, IconGlyph> = {
  home: { outline: 'home-outline', filled: 'home' },
  requests: { outline: 'document-text-outline', filled: 'document-text' },
  notifications: { outline: 'notifications-outline', filled: 'notifications' },
  mypage: { outline: 'person-outline', filled: 'person' },
  camera: { outline: 'camera-outline', filled: 'camera' },
  image: { outline: 'image-outline', filled: 'image' },
  document: { outline: 'clipboard-outline', filled: 'clipboard' },
  truck: { family: 'material', outline: 'truck-outline', filled: 'truck' },
  tools: { outline: 'construct-outline', filled: 'construct' },
  building: { outline: 'business-outline', filled: 'business' },
  check: { outline: 'checkmark-circle-outline', filled: 'checkmark-circle' },
  lock: { outline: 'lock-closed-outline', filled: 'lock-closed' },
  star: { outline: 'star-outline', filled: 'star' },
  settings: { outline: 'settings-outline', filled: 'settings' },
  phone: { outline: 'call-outline', filled: 'call' },
  sparkles: { outline: 'sparkles-outline', filled: 'sparkles' },
  location: { outline: 'location-outline', filled: 'location' },
  chat: { outline: 'chatbubble-ellipses-outline', filled: 'chatbubble-ellipses' },
  alert: { outline: 'alert-circle-outline', filled: 'alert-circle' },
  recycle: { family: 'material', outline: 'recycle-variant', filled: 'recycle' },
  hammer: { outline: 'hammer-outline', filled: 'hammer' },
  palette: { outline: 'color-palette-outline', filled: 'color-palette' },
  user: { outline: 'person-outline', filled: 'person' },
  lightbulb: { outline: 'bulb-outline', filled: 'bulb' },
  shield: { outline: 'shield-checkmark-outline', filled: 'shield-checkmark' },
  card: { outline: 'card-outline', filled: 'card' },
};

export function AppIcon({
  name,
  size = 22,
  color = theme.colors.text,
  filled = false,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const glyph = ICON_MAP[name] ?? ICON_MAP.home;
  if (glyph.family === 'material') {
    const iconName = filled ? glyph.filled : glyph.outline;
    return <MaterialCommunityIcons name={iconName} size={size} color={color} style={style} />;
  }
  const iconName = filled ? glyph.filled : glyph.outline;
  return <Ionicons name={iconName} size={size} color={color} style={style} />;
}
