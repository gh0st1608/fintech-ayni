import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { BUTTON_HEIGHT, colors, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

/** Botón del design system. Mientras `loading` está activo bloquea el doble envío. */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.primary} />
      ) : (
        <AppText
          variant="highlight"
          weight="semibold"
          color={isPrimary ? colors.onPrimary : colors.primary}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: radius.md,
    paddingHorizontal: spacing.l,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  disabled: { backgroundColor: colors.secondary200, borderColor: colors.secondary200 },
  pressed: { opacity: 0.85 },
});
