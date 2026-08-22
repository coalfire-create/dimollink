import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, TabBar, useNavigation, useSession } from '../navigation';
import { ROLE_CONFIG } from '../roleConfig';
import { theme } from '../theme';

export function InteriorHomeScreen() {
  const nav = useNavigation();
  const user = useSession();
  const config = ROLE_CONFIG.INTERIOR_COMPANY;

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // 인테리어 업체는 별도의 일감 피드 없이 인테리어 목록(InteriorListScreen)으로 이동한다.
    return Promise.resolve();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={`${user.name}${config.homeGreetingSuffix}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <FadeInUp delay={20}>
          <View style={styles.bannerContainer}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerTitle}>인테리어 시공 파트너스</Text>
              <Text style={styles.bannerSubtitle}>디몰링크 파트너스</Text>
            </View>
            <Text style={{fontSize: 70, position: 'absolute', right: 20, bottom: 20}}>🔨</Text>
          </View>
        </FadeInUp>

        <FadeInUp delay={80}>
          <Pressable
            style={styles.interiorCard}
            onPress={() => nav.push({ name: 'interiorList', scope: 'open' })}
          >
            <Text style={styles.interiorEmoji}>🛠️</Text>
            <View style={styles.interiorTextBox}>
              <Text style={styles.interiorTitle}>들어온 시공 요청 보기</Text>
              <Text style={styles.interiorSubtitle}>요청을 보고 비밀 견적을 넣어요</Text>
            </View>
            <Text style={styles.interiorChevron}>›</Text>
          </Pressable>
        </FadeInUp>

      </ScrollView>
      <TabBar active="home" />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  bannerContainer: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    margin: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    height: 120,
  },
  bannerLeft: {
    flex: 1,
    zIndex: 2,
  },
  bannerTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: font.body,
    fontWeight: '600',
  },
  bannerSubtitle: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '800',
    marginTop: 4,
  },
  interiorCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  interiorEmoji: {
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  interiorTextBox: {
    flex: 1,
  },
  interiorTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  interiorSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: 2,
  },
  interiorChevron: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
});
