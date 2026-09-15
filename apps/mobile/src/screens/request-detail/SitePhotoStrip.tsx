import React from 'react';
import { Image, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../../theme';

/**
 * 현장 사진 가로 스크롤 — 상세에서 사진을 훑어보는 자리.
 *
 * 세로로 쌓지 않는 이유: 사진이 대여섯 장이면 그 아래 정보(금액·일정·업체)가
 * 화면 밖으로 밀려나 버린다. 사진은 확인용이지 이 화면의 주인공이 아니다.
 */
export function SitePhotoStrip({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
      {urls.map((url) => (
        <Image
          key={url}
          accessibilityLabel="현장 사진"
          source={{ uri: url }}
          style={styles.photo}
          resizeMode="cover"
        />
      ))}
    </ScrollView>
  );
}

const { colors, spacing } = theme;

const styles = StyleSheet.create({
  strip: {
    marginVertical: spacing.xs,
  },
  photo: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    height: 120,
    marginRight: spacing.xs,
    width: 120,
  },
});
