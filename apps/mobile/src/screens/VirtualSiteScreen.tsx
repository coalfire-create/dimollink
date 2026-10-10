import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScreen } from '../components/ui';
import { ScreenHeader } from '../navigation';
import { theme } from '../theme';
import { EstimateTab } from './virtual-site/EstimateTab';
import { OverviewTab } from './virtual-site/OverviewTab';
import { PhotosTab } from './virtual-site/PhotosTab';
import { ScanVolumeTab } from './virtual-site/ScanVolumeTab';
import { VideoTab } from './virtual-site/VideoTab';

/**
 * 가상 현장 — 철거업체가 현장에 가지 않고 **현장에서 보던 순서대로** 본다(껍데기).
 *
 * 개요(무엇이 위험한가) → 사진(체크리스트 순서) → 3D·물량 → 영상통화 → 확정 견적.
 * 이 파일은 탭 전환만 한다. 각 탭이 자기 데이터를 직접 불러온다 — 사진만 보러 온 업체가
 * 3D 결과·통화 목록까지 기다리지 않고, 탭을 추가할 때 여기를 고칠 일이 적다.
 */

type TabKey = 'overview' | 'photos' | 'scan' | 'video' | 'estimate';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '개요' },
  { key: 'photos', label: '사진' },
  { key: 'scan', label: '3D·물량' },
  { key: 'video', label: '영상통화' },
  { key: 'estimate', label: '확정 견적' },
];

export function VirtualSiteScreen({ requestId }: { requestId: string }) {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <KeyboardAwareScreen style={styles.screen}>
      <ScreenHeader title="가상 현장" canGoBack />

      {/* 가로 스크롤 탭 — 감싸지 않으면 세로 flex 안에서 라벨이 잘린다(관리자 화면과 같은 이유). */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              onPress={() => setTab(item.key)}
              style={[styles.tab, tab === item.key && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, tab === item.key && styles.tabLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'overview' ? <OverviewTab requestId={requestId} /> : null}
        {tab === 'photos' ? <PhotosTab requestId={requestId} /> : null}
        {tab === 'scan' ? <ScanVolumeTab requestId={requestId} /> : null}
        {tab === 'video' ? <VideoTab requestId={requestId} /> : null}
        {tab === 'estimate' ? <EstimateTab requestId={requestId} /> : null}
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const { colors, font, spacing, touch, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.appBackground, flex: 1 },
  tabBarWrap: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  tabBar: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabLabel: { color: colors.textMuted, fontSize: font.body, fontWeight: '700' },
  tabLabelActive: { color: colors.primary, fontWeight: '800' },
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.lg + theme.floatingButtonClearance,
  },
});
