import { Pressable, StyleSheet, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
}

interface SegmentedTabsProps<K extends string> {
  options: readonly SegmentOption<K>[];
  selectedKey: K;
  onChange: (key: K) => void;
  testID?: string;
}

/** Selector de pestañas del Figma (Active/Finished, Payments/Payouts, tipos de turno). */
export function SegmentedTabs<K extends string>({
  options,
  selectedKey,
  onChange,
  testID,
}: SegmentedTabsProps<K>) {
  return (
    <View accessibilityRole="tablist" style={styles.container} testID={testID}>
      {options.map(({ key, label }) => {
        const selected = key === selectedKey;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => !selected && onChange(key)}
            style={[styles.tab, selected ? styles.selected : styles.idle]}
          >
            <AppText
              variant="caption"
              weight="semibold"
              color={selected ? colors.onPrimary : colors.black}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  selected: { backgroundColor: colors.primary },
  idle: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.secondary100 },
});
