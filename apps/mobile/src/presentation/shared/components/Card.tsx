import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/presentation/theme/tokens';

interface CardProps {
  children: React.ReactNode;
  /** Si se define, la tarjeta es pulsable y se anuncia como botón. */
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Contenedor de las tarjetas del Figma (fondo claro con borde, sin sombra). */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  selected = false,
  disabled = false,
  style,
  testID,
}: CardProps) {
  const cardStyle = [styles.card, selected && styles.selected, disabled && styles.disabled, style];

  if (!onPress) {
    return (
      <View style={cardStyle} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderColor: colors.secondary100,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.surface },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
