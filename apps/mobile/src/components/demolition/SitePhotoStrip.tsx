import React, { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSitePhotoViewUrl } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { Card, ImagePlaceholder, SectionTitle } from '../ui';
import { PressableScale } from '../motion';
import { theme } from '../../theme';

/**
 * 현장 사진 — 가로 스크롤 썸네일 + 전체화면 보기.
 *
 * 견적을 내는 업체에게 사진은 유일한 "현장 실물" 근거인데, 지금까지 요청 카드에
 * 아예 안 떴다. 저장된 것은 오브젝트 key 뿐이라 화면에서 서명 URL 로 바꿔야 한다.
 *
 * 스토리지가 아직 설정 안 된 환경(.env 미설정)에서는 서버가 503 을 준다 — 그때는
 * 사진을 못 불러왔다고 조용히 알리고, 화면 자체는 그대로 뜬다.
 */

export function SitePhotoStrip({ photoKeys }: { photoKeys: readonly string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (photoKeys.length === 0) return;
    const pairs = await Promise.all(
      photoKeys.map(async (key) => {
        try {
          const res = await getSitePhotoViewUrl(key);
          return [key, res.viewUrl] as const;
        } catch {
          return null;
        }
      }),
    );
    const ok = pairs.filter((p): p is readonly [string, string] => p !== null);
    setUrls(Object.fromEntries(ok));
    setFailed(ok.length === 0);
  }, [photoKeys]);

  useEffect(() => {
    void load();
  }, [load]);

  if (photoKeys.length === 0) {
    return (
      <View>
        <SectionTitle>현장 사진</SectionTitle>
        <Card>
          <ImagePlaceholder height={160} label="신청자가 올린 사진이 없습니다" />
          <Text style={styles.hint}>
            사진이 없으면 내부 상태를 알 수 없습니다. 개산 범위를 넓게 잡고, 실사에서 확인하세요.
          </Text>
        </Card>
      </View>
    );
  }

  return (
    <View>
      <SectionTitle>현장 사진 {photoKeys.length}장</SectionTitle>
      {failed ? (
        <Card>
          <Text style={styles.hint}>
            사진을 불러오지 못했습니다. 연결 상태를 확인하고 화면을 다시 열어 주세요.
          </Text>
        </Card>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {photoKeys.map((key) => {
            const uri = urls[key];
            return (
              <PressableScale
                key={key}
                accessibilityLabel="현장 사진 크게 보기"
                disabled={!uri}
                onPress={() => uri && setZoomed(uri)}
                style={styles.thumb}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbLoading} />
                )}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={zoomed !== null} transparent onRequestClose={() => setZoomed(null)}>
        <View style={styles.zoomBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 닫기"
            onPress={() => setZoomed(null)}
            style={styles.zoomClose}
          >
            <AppIcon name="check" size={24} color={colors.background} />
          </Pressable>
          {zoomed ? (
            <Image source={{ uri: zoomed }} style={styles.zoomImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  strip: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  thumb: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    height: 160,
    overflow: 'hidden',
    width: 200,
  },
  thumbImage: {
    height: '100%',
    width: '100%',
  },
  thumbLoading: {
    backgroundColor: colors.surface,
    height: '100%',
    width: '100%',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  zoomBackdrop: {
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'center',
  },
  zoomClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.badge,
    height: touch.minButtonHeight,
    justifyContent: 'center',
    margin: spacing.md,
    position: 'absolute',
    right: 0,
    top: spacing.lg,
    width: touch.minButtonHeight,
    zIndex: 2,
  },
  zoomImage: {
    height: '80%',
    width: '100%',
  },
});
