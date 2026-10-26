import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Chevron } from './Chevron';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ListItemProps {
  title: string;
  description?: string;
  icon?: IconName;
  /** Contenido a la derecha (badge, toggle, icono de estado). Por defecto, una flecha de avance. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** Fila de navegación de Perfil, Pagos y Documentos: icono, título, descripción y acción. */
export function ListItem({
  title,
  description,
  icon,
  trailing,
  onPress,
  disabled = false,
  accessibilityHint,
  testID,
}: ListItemProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}
      testID={testID}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={22}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View style={styles.text}>
        <AppText weight="semibold">{title}</AppText>
        {description && (
          <AppText variant="caption" color={colors.neutral500}>
            {description}
          </AppText>
        )}
      </View>
      {trailing ?? (onPress ? <Chevron /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.m,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary100,
    backgroundColor: colors.background,
  },
  text: { flex: 1, gap: spacing.xxs },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
