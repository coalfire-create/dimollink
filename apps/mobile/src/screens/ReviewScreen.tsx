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
import { AppButton, ErrorBanner } from '../components/ui';
import { ScreenHeader, useNavigation } from '../navigation';
import { theme } from '../theme';

/**
 * 리뷰 작성 화면. 
 * 완료/정산된 일감에 대해 상대방을 1~5점(별점) 및 한줄평으로 평가한다.
 */
export function ReviewScreen({ requestId }: { requestId: string }) {
  const nav = useNavigation();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await createReview({ requestId, rating, comment });
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
            <Text style={styles.title}>업체(또는 고객)의 서비스는 어떠셨나요?</Text>
            <Text style={styles.subtitle}>
              솔직한 평가가 플랫폼의 신뢰를 높입니다.
            </Text>

            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((idx) => (
                <Pressable key={idx} onPress={() => setRating(idx)} style={styles.starBtn}>
                  <AppIcon
                    name="star"
                    size={36}
                    // 별점은 오류가 아니다 — 오류 전용 빨강 대신 브랜드 보조색(주황)을 쓴다.
                    color={idx <= rating ? theme.colors.secondary : theme.colors.border}
                    filled={idx <= rating}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingText}>{rating}점 / 5점</Text>

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
        <View style={styles.footer}>
          <AppButton
            label="리뷰 등록하기"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    padding: 4,
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
  footer: {
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    padding: theme.spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 32 : theme.spacing.sm,
  },
});
