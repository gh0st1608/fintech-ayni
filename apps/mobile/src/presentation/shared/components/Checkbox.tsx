import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** Casilla con etiqueta del Figma ("Remember Me", 55:10770). */
export function Checkbox({ label, checked, onChange, disabled = false, testID }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, disabled && styles.disabled]}
      testID={testID}
    >
      <View style={[styles.box, checked ? styles.checked : styles.unchecked]}>
        {checked && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
      </View>
      <AppText weight="semibold" color={colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.primary },
  unchecked: { borderWidth: 1.5, borderColor: colors.borderNormal },
  disabled: { opacity: 0.5 },
});
