import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useWideLayout } from '../../lib/layout';
import { theme } from '../../theme';

/**
 * 데스크톱 웹에서만 펼쳐지는 배치 조각. 모바일(앱·좁은 브라우저)에서는 자식을
 * 그대로 세로로 쌓아 기존 화면과 똑같이 그린다 — 화면 코드는 한 벌만 둔다.
 */

/** 카드 목록을 여러 칸으로. 모바일에서는 그냥 세로 목록. */
export function ResponsiveGrid({
  children,
  columns = 2,
}: {
  children: React.ReactNode;
  columns?: number;
}) {
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.grid}>
      {items.map((child, i) => (
        <View key={i} style={[styles.gridCell, { width: `${100 / columns}%` }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * 본문(왼쪽 넓게) + 보조(오른쪽 좁게) 2단. 모바일에서는 본문 → 보조 순으로 쌓는다.
 * 보조에는 시세·보장 안내처럼 "옆에 두고 참고하는" 블록을 둔다.
 */
export function WideColumns({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  const wide = useWideLayout();
  if (!wide) {
    return (
      <>
        {main}
        {side}
      </>
    );
  }
  return (
    <View style={styles.columns}>
      <View style={styles.mainColumn}>{main}</View>
      <View style={styles.sideColumn}>{side}</View>
    </View>
  );
}

const { spacing } = theme;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  gridCell: {
    paddingHorizontal: spacing.xs,
  },
  columns: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  mainColumn: {
    flex: 3,
    minWidth: 0,
  },
  sideColumn: {
    flex: 2,
    minWidth: 0,
  },
});
