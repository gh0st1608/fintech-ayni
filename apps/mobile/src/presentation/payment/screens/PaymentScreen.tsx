import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { usePaymentSummary } from '../usePayments';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface PaymentScreenProps {
  /** Estado vacío: "Join New Circle" abre "Choose a Service". */
  onJoin: () => void;
  onOpenHistory: () => void;
  /** Sin pantalla todavía (COPAYNI-36 y 38): el acceso queda deshabilitado. */
  onOpenEligibility?: () => void;
  onOpenSettings?: () => void;
}

/** Fecha `YYYY-MM-DD` como fecha local, para formatearla con el idioma activo. */
function localDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!);
}

/**
 * Payment (Figma 55:9846): resumen de pagos y accesos de la sección (COPAYNI-35). Se armó con la
 * captura del Figma y los componentes existentes: el contexto de diseño no se pudo leer por el
 * límite del plan. El estado con pagos pendientes no tiene diseño (D1): muestra el total y las
 * cuotas. Los accesos siguen disponibles aunque falle el resumen.
 */
export function PaymentScreen({
  onJoin,
  onOpenHistory,
  onOpenEligibility,
  onOpenSettings,
}: PaymentScreenProps) {
  const { t } = useTranslation();
  const summary = usePaymentSummary();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={summary.isRefetching}
            onRefresh={() => void summary.refetch()}
          />
        }
      >
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('tabs.payment')}
        </AppText>
        {summary.isPending ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.loading} />
        ) : summary.isError && !summary.data ? (
          <View style={styles.error} testID="payment-summary-error">
            <AppText accessibilityRole="alert" style={styles.center}>
              {errorMessage(t, summary.error)}
            </AppText>
            <Button
              label={t('common.retry')}
              variant="secondary"
              onPress={() => void summary.refetch()}
            />
          </View>
        ) : summary.data.hasDuePayments ? (
          <DuePayments summary={summary.data} />
        ) : (
          <EmptyState
            title={t('payment.empty.title')}
            description={t('payment.empty.description')}
            action={{ label: t('payment.empty.join'), onPress: onJoin }}
            testID="payment-empty"
          />
        )}

        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('payment.others.title')}
        </AppText>
        <View style={styles.grid}>
          <Shortcut
            icon="checkbox-outline"
            label={t('payment.others.eligibility')}
            onPress={onOpenEligibility}
          />
          <Shortcut
            icon="settings-outline"
            label={t('payment.others.settings')}
            onPress={onOpenSettings}
          />
          <Shortcut
            icon="cash-outline"
            label={t('payment.others.history')}
            onPress={onOpenHistory}
          />
          {/* Payment Policy y Help no tienen diseño (D7). */}
          <Shortcut icon="document-text-outline" label={t('payment.others.policy')} />
          <Shortcut icon="help-circle-outline" label={t('payment.others.help')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function DuePayments({ summary }: { summary: PaymentSummary }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();

  return (
    <View style={styles.due} testID="payment-due">
      {summary.totalDue && (
        <Card>
          <AppText variant="caption" color={colors.neutral500}>
            {t('payment.due.total')}
          </AppText>
          <AppText variant="title" weight="semibold">
            {formatMoney(summary.totalDue)}
          </AppText>
          {summary.nextDueOn && (
            <AppText variant="caption">
              {t('payment.due.next', { date: formatDate(localDate(summary.nextDueOn), 'date') })}
            </AppText>
          )}
        </Card>
      )}
      {summary.debt && (
        <Card testID="payment-debt">
          <AppText weight="semibold" color={colors.error}>
            {t('payment.due.debt', { amount: formatMoney(summary.debt) })}
          </AppText>
          <AppText variant="caption">{t('payment.due.debtDescription')}</AppText>
        </Card>
      )}
      {summary.duePayments.map((due) => (
        <Card key={`${due.circleId}-${due.period}`} style={styles.dueRow}>
          <View style={styles.dueText}>
            <AppText weight="semibold">{formatMoney(due.amount)}</AppText>
            <AppText variant="caption" color={colors.neutral500}>
              {t('payment.due.dueOn', { date: formatDate(localDate(due.dueOn), 'date') })}
            </AppText>
          </View>
          {due.status === 'overdue' && <Badge label={t('payment.due.overdue')} tone="subtle" />}
        </Card>
      ))}
    </View>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      onPress={onPress ?? (() => undefined)}
      disabled={!onPress}
      accessibilityLabel={onPress ? label : `${label}, ${t('common.comingSoon')}`}
      style={styles.shortcut}
    >
      <Ionicons name={icon} size={24} color={colors.black} />
      <AppText variant="caption">{label}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.m },
  loading: { paddingVertical: spacing.xl },
  error: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
  due: { gap: spacing.m },
  dueRow: { flexDirection: 'row', alignItems: 'center' },
  dueText: { flex: 1, gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  shortcut: { flexBasis: '47%', flexGrow: 0, gap: spacing.m },
});
