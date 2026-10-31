import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/shared/components/AppText';
import { Card } from '@/presentation/shared/components/Card';
import { colors, spacing } from '@/presentation/theme/tokens';

export interface JoinSummaryRow {
  /** Qué es el valor; no se ve, pero se anuncia (el Figma solo muestra el valor). */
  label: string;
  value: string;
  /** Nombre accesible de "Editar" ("Editar el monto de payout"). */
  editLabel: string;
  onEdit: () => void;
}

/** Resumen editable de los pasos anteriores (Figma 55:9334 y 55:9377): ✔ valor · Editar ✎. */
export function JoinSummary({ rows }: { rows: JoinSummaryRow[] }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.card} testID="join-summary">
      {rows.map(({ label, value, editLabel, onEdit }, index) => (
        <View key={label} style={[styles.row, index > 0 && styles.divided]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          <AppText weight="semibold" style={styles.value} accessibilityLabel={`${label}: ${value}`}>
            {value}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editLabel}
            onPress={onEdit}
            hitSlop={spacing.sm}
            style={styles.edit}
          >
            <AppText variant="caption" weight="semibold" color={colors.primary}>
              {t('join.monthlyPayIn.edit')}
            </AppText>
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.m, marginTop: spacing.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divided: { paddingTop: spacing.m, borderTopWidth: 1, borderTopColor: colors.secondary100 },
  value: { flex: 1 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
