import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from './ui';
import { AppIcon } from './AppIcon';
import { theme } from '../theme';

/**
 * 오류 경계 — 화면 렌더 중 예외가 나도 앱 전체가 흰 화면이 되지 않게 막는다.
 *
 * RN 에서 렌더 예외를 잡을 방법은 클래스 컴포넌트의 componentDidCatch 뿐이라
 * 이 파일만 클래스다. 잡은 뒤에는 **홈으로 돌아갈 길**을 반드시 준다 — 안내만 띄우고
 * 길이 없으면 사용자는 앱을 강제 종료하는 수밖에 없다.
 *
 * 화면을 바꿀 때마다 resetKey 를 바꿔 주면 오류 상태가 그 화면에만 남는다
 * (다른 화면으로 이동했는데 계속 오류 화면이 보이는 일을 막는다).
 */

interface Props {
  children: React.ReactNode;
  /** 값이 바뀌면 오류 상태를 초기화한다(라우트 키 등). */
  resetKey?: string;
  /** "홈으로 가기" 동작. 없으면 다시 시도만 노출한다. */
  onGoHome?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error): void {
    // 개발 중에만 원인을 남긴다. 운영 로그에는 사용자 정보가 섞일 수 있어 올리지 않는다.
    if (__DEV__) console.error('[ErrorBoundary]', error);
  }

  private retry = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconCircle}>
            <AppIcon name="alert" size={32} color={theme.colors.error} />
          </View>
          <Text style={styles.title}>화면을 여는 중 문제가 생겼어요</Text>
          <Text style={styles.body}>
            잠시 후 다시 시도해 주세요. 계속 같은 화면에서 문제가 생기면 고객센터로 알려 주시면 바로
            확인해 드릴게요.
          </Text>
          {__DEV__ ? <Text style={styles.devDetail}>{error.message}</Text> : null}
          <AppButton label="다시 시도" onPress={this.retry} style={styles.button} />
          {this.props.onGoHome ? (
            <AppButton
              label="홈으로 가기"
              variant="outline"
              onPress={() => {
                this.setState({ error: null });
                this.props.onGoHome?.();
              }}
              style={styles.button}
            />
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 88,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 26,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  devDetail: {
    color: colors.error,
    fontSize: font.caption,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginBottom: spacing.xs,
  },
});
