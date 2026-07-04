import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from '@dimol/shared';
import { ApiError, listMessages, sendMessage } from '../api/client';
import { EmptyState, ErrorBanner } from '../components/ui';
import { ScreenHeader, useSession } from '../navigation';
import { theme } from '../theme';

/** 인앱 채팅 (Phase 4) — since 파라미터 폴링(5초)으로 새 메시지를 가져온다. */

const POLL_INTERVAL_MS = 5_000;

export function ChatScreen({ requestId }: { requestId: string }) {
  const user = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastCreatedAt = useRef<string | undefined>(undefined);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const poll = useCallback(async () => {
    try {
      const fresh = await listMessages(requestId, user.id, lastCreatedAt.current);
      const newest = fresh.at(-1);
      if (newest) {
        lastCreatedAt.current = newest.createdAt;
        setMessages((prev) => [...prev, ...fresh]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '메시지를 불러오지 못했습니다.');
    }
  }, [requestId, user.id]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendMessage(requestId, user.id, content);
      setDraft('');
      await poll();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="채팅" canGoBack />
      <ErrorBanner message={error} />
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <EmptyState title="대화를 시작해 보세요" description="일정·현장 상황을 편하게 물어보세요." />
        }
        renderItem={({ item }) => {
          const mine = item.senderId === user.id;
          return (
            <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, mine && { color: colors.background }]}>
                  {item.content}
                </Text>
                <Text style={[styles.bubbleTime, mine && { color: '#C7D9F5' }]}>
                  {new Date(item.createdAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.inputBar}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="메시지를 입력하세요"
          placeholderTextColor={colors.textMuted}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="보내기"
          onPress={submit}
          disabled={sending || draft.trim().length === 0}
          style={({ pressed }) => [
            styles.sendButton,
            (sending || draft.trim().length === 0) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.sendLabel}>보내기</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const { colors, font, spacing, touch, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  list: {
    flexGrow: 1,
    padding: spacing.sm,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  bubble: {
    borderRadius: radius.card,
    maxWidth: '80%',
    padding: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
  },
  bubbleText: {
    color: colors.text,
    fontSize: font.body,
  },
  bubbleTime: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 2,
  },
  inputBar: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    padding: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    marginRight: spacing.xs,
    maxHeight: 120,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    height: touch.minButtonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  sendLabel: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '700',
  },
});
