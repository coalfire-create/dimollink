import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, createReview } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { AppButton, ErrorBanner, StickyFooter } from '../components/ui';
import { useToast } from '../components/Toast';
import { ScreenHeader, useNavigation, useSession } from '../navigation';
import { theme } from '../theme';

/**
 * 리뷰 작성 화면.
 * 완료/정산된 일감에 대해 상대방을 1~5점(별점) 및 한줄평으로 평가한다.
 *
 * 점수는 숫자보다 말로 읽힌다("5점 / 5점" → "최고예요") — 고령 사용자가 별 개수를
 * 세지 않아도 지금 고른 점수가 무슨 뜻인지 바로 안다.
 */
const RATING_WORDS: Record<number, string> = {
  1: '별로예요',
  2: '아쉬워요',
  3: '보통이에요',
  4: '좋아요',
  5: '최고예요',
};
export function ReviewScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const user = useSession();
  const toast = useToast();
  // 배출자는 업체를, 업체는 고객을 평가한다 — "업체(또는 고객)"처럼 둘 다 적지 않는다.
  const question = user.userType === 'CONSUMER' ? '업체는 어땠나요?' : '고객은 어땠나요?';
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await createReview({ requestId, rating, comment });
      toast.success('후기를 남겼어요', '소중한 평가 고마워요.');
      nav.pop();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('리뷰 등록 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="평가하기" canGoBack />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {error ? (
            <View style={styles.error}>
              <ErrorBanner message={error} />
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">
              {question}
            </Text>
            <Text style={styles.subtitle}>별을 눌러 점수를 골라 주세요.</Text>

            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <Pressable
                  key={idx}
                  accessibilityRole="button"
                  accessibilityLabel={`별점 ${idx}점`}
                  accessibilityState={{ selected: idx <= rating }}
                  onPress={() => setRating(idx)}
                  style={styles.starBtn}
                >
                  <AppIcon
                    name="star"
                    size={44}
                    // 별점은 오류가 아니다 — 오류 전용 빨강 대신 브랜드 보조색(주황)을 쓴다.
                    color={idx <= rating ? theme.colors.secondary : theme.colors.border}
                    filled={idx <= rating}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingText}>
              {RATING_WORDS[rating]} ({rating}점)
            </Text>

            <Text style={styles.label}>한줄평 (선택)</Text>
            <TextInput
              style={styles.input}
              placeholder="서비스에 대한 솔직한 의견을 남겨주세요."
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={200}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </ScrollView>
        <StickyFooter>
          <AppButton
            label="후기 남기기"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
          />
        </StickyFooter>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.appBackground,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.sm,
  },
  error: {
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: theme.spacing.md,
    ...theme.shadow.card,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.font.title,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.font.body,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  starBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    minWidth: theme.touch.minButtonHeight,
  },
  ratingText: {
    fontSize: theme.font.bodyLarge,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: theme.font.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.font.body,
    minHeight: 100,
    padding: theme.spacing.sm,
    textAlignVertical: 'top',
  },
});
