import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import { AppButton } from './AppButton';
import { IconTile } from './IconTile';
import type { IconName } from '../AppIcon';

/**
 * 결과·상태 표시 — 오류 배너, 로딩, 빈 목록.
 *
 * 셋 다 "지금 보여줄 내용이 없다"를 다루지만 원인이 달라서 생김새를 나눴다.
 * 오류는 고칠 수 있는 문제, 로딩은 기다리면 되는 상태, 빈 목록은 아직 할 일이 없는 상태다.
 * 오류 문구는 서버가 준 한글 메시지를 그대로 쓴다(사용자에게 노출 가능한 문구다).
 */
// ── 오류 배너 (서버 한글 메시지 그대로 노출)
// onRetry 를 주면 "다시 시도" 버튼이 같이 뜬다 — 통신 실패를 사용자가 스스로 풀 수 있게.
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          onPress={onRetry}
          style={styles.errorRetry}
        >
          <Text style={styles.errorRetryText}>다시 시도</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── 로딩 / 빈 목록
export function LoadingView() {
  return (
    <View style={styles.centerFill}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/**
 * 섹션 안에서 쓰는 작은 빈 상태.
 *
 * 화면 전체가 비었을 때는 EmptyState 를, 화면 안의 한 섹션("들어온 콜" 같은)이 비었을 때는
 * 이것을 쓴다. 예전에는 회색 글자 한 줄만 덩그러니 놓여서, 비어 있는 건지 아직 불러오는
 * 중인지 구분이 안 됐다.
 */
export function InlineEmpty({
  children,
  actionLabel,
  onAction,
}: {
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.inlineEmpty}>
      <Text style={styles.inlineEmptyText}>{children}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={styles.inlineEmptyAction}
        >
          <Text style={styles.inlineEmptyActionText}>{actionLabel} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  icon?: IconName | string;
  /** 빈 화면에서 바로 할 수 있는 다음 행동(예: "철거 요청하기"). */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isIconName =
    icon &&
    ([
      'notifications',
      'document',
      'truck',
      'building',
      'home',
      'requests',
      'mypage',
      'tools',
      'check',
      'star',
      'settings',
      'phone',
      'sparkles',
      'camera',
      'chat',
      'alert',
      'recycle',
      'hammer',
      'lock',
    ].includes(icon) ||
      icon.length > 2);
  return (
    <View style={styles.centerFill}>
      {icon ? (
        isIconName ? (
          <IconTile icon={(icon as IconName) || 'document'} size="lg" style={styles.emptyTile} />
        ) : (
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>{icon}</Text>
          </View>
        )
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDescription}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  errorBanner: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '600',
  },
  errorRetry: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: touch.minButtonHeight,
  },
  errorRetryText: {
    color: colors.error,
    fontSize: font.body,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  centerFill: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  inlineEmpty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inlineEmptyText: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    textAlign: 'center',
  },
  inlineEmptyAction: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
  },
  inlineEmptyActionText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  emptyIconCircle: {
    alignItems: 'center',
    // surface 로 두면 회색 배경 화면에서 원이 배경과 같은 색이라 안 보인다.
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 88,
  },
  emptyTile: {
    marginBottom: spacing.md,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: spacing.md,
    minWidth: 200,
  },
});
