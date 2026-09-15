import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AddressSearchResult } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { theme } from '../../theme';

/**
 * 지도 위에 떠 있는 주소 검색바 + 결과 드롭다운.
 *
 * 지도 안에 넣지 않고 위에 띄우는 이유: 지도를 움직이는 동안에도 검색어가 보여야
 * "내가 찾던 데가 여기 맞나"를 대조할 수 있다.
 */
export function MapSearchBar({
  query,
  onChangeQuery,
  searching,
  results,
  showDropdown,
  onSubmit,
  onSelect,
}: {
  query: string;
  onChangeQuery: (value: string) => void;
  searching: boolean;
  results: AddressSearchResult[];
  showDropdown: boolean;
  onSubmit: () => void;
  onSelect: (item: AddressSearchResult) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <View style={styles.icon}>
          <AppIcon name="location" size={20} color={colors.textMuted} />
        </View>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="도로명, 건물명, 지번으로 검색"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
        />
        {searching ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
        ) : query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
            style={styles.clearBtn}
            onPress={() => onChangeQuery('')}
            hitSlop={8}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {showDropdown ? (
        <View style={styles.dropdownContainer}>
          {results.length > 0 ? (
            <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled">
              {results.map((item, index) => (
                <Pressable
                  key={`${item.addressName}-${index}`}
                  accessibilityRole="button"
                  style={styles.dropdownItem}
                  onPress={() => onSelect(item)}
                >
                  <Text style={styles.dropdownRoad} numberOfLines={1}>
                    {item.roadAddressName}
                    {item.buildingName ? (
                      <Text style={styles.dropdownBuilding}> · {item.buildingName}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.dropdownRegion} numberOfLines={1}>
                    {item.addressName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : !searching ? (
            <View style={styles.dropdownEmpty}>
              <Text style={styles.dropdownEmptyText}>검색 결과가 없어요.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 1100,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xs + 4,
    minHeight: theme.touch.minButtonHeight + 8,
    ...theme.shadow.card,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
  },
  icon: {
    marginRight: spacing.xs / 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.xs / 2,
    paddingVertical: spacing.xs,
    fontSize: font.body,
    color: colors.text,
  },
  spinner: {
    marginHorizontal: spacing.xs,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    lineHeight: font.caption,
  },
  dropdownContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginTop: spacing.xs,
    maxHeight: 264,
    ...theme.shadow.card,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
  },
  dropdownRoad: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  dropdownBuilding: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '600',
  },
  dropdownRegion: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.xs / 4,
  },
  dropdownEmpty: {
    padding: spacing.md,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    color: colors.textMuted,
    fontSize: font.body,
  },
});
