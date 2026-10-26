import { StyleSheet, Switch, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

interface ToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** Interruptor con etiqueta ("Deduct pay-in from payout", "Enable Biometrics"). */
export function Toggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: ToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text} importantForAccessibility="no-hide-descendants">
        <AppText weight="semibold">{label}</AppText>
        {description && (
          <AppText variant="caption" color={colors.neutral500}>
            {description}
          </AppText>
        )}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={description}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.secondary200, true: colors.primary }}
        thumbColor={colors.surface}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: { flex: 1, gap: spacing.xxs },
});
