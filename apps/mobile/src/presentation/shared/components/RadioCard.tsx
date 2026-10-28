import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Badge } from './Badge';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface RadioCardProps {
  title: string;
  description?: string;
  icon?: IconName;
  /** Etiqueta encima del título ("No Charge"). */
  badge?: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  /** Motivo visible cuando la opción no está disponible ("Not available"). */
  disabledReason?: string;
  testID?: string;
}

/** Opción seleccionable del Figma (Payout Method, Proof of Income). Usar dentro de `RadioGroup`. */
export function RadioCard({
  title,
  description,
  icon,
  badge,
  selected,
  onSelect,
  disabled = false,
  disabledReason,
  testID,
}: RadioCardProps) {
  // El badge se ve, así que también se anuncia (p. ej. "Sin costo").
  const accessibilityLabel = [title, badge, description, disabled ? disabledReason : undefined]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <View style={styles.content} importantForAccessibility="no-hide-descendants">
        {badge && <Badge label={badge} />}
        <View style={styles.titleRow}>
          {icon && <Ionicons name={icon} size={20} color={colors.black} />}
          <AppText weight="semibold">{title}</AppText>
        </View>
        {description && (
          <AppText variant="caption" color={colors.neutral500}>
            {description}
          </AppText>
        )}
        {disabled && disabledReason && (
          <AppText variant="footnote" color={colors.neutral600}>
            {disabledReason}
          </AppText>
        )}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  );
}

/** Contenedor de opciones excluyentes: lo anuncia como grupo a los lectores de pantalla. */
export function RadioGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {children}
    </View>
  );
}

const RADIO_SIZE = 20;

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary100,
    backgroundColor: colors.background,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.surface },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  content: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: {
    width: RADIO_SIZE / 2,
    height: RADIO_SIZE / 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
