import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/presentation/shared/components/AppText';
import { Card } from '@/presentation/shared/components/Card';
import { colors, spacing } from '@/presentation/theme/tokens';

export interface JoinSummaryRow {
  label: string;
  value: string;
  /** Nombre accesible de "Editar" ("Editar el monto de payout"). */
  editLabel: string;
  onEdit: () => void;
}

/** Resumen editable de los pasos anteriores del flujo de unión. */
export function JoinSummary({ rows }: { rows: JoinSummaryRow[] }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.card} testID="join-summary">
      {rows.map(({ label, value, editLabel, onEdit }) => (
        <View key={label} style={styles.row}>
          <View style={styles.text}>
            <AppText variant="caption" color={colors.neutral500}>
              {label}
            </AppText>
            <AppText weight="semibold">{value}</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editLabel}
            onPress={onEdit}
            hitSlop={spacing.sm}
          >
            <AppText weight="semibold" color={colors.primary}>
              {t('join.monthlyPayIn.edit')}
            </AppText>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.m, marginTop: spacing.l },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: spacing.xxs },
});
