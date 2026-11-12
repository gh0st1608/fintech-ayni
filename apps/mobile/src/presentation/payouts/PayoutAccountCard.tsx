import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { usePayoutAccount } from '@/presentation/payouts/usePayoutMethods';
import { AppText } from '@/presentation/shared/components/AppText';
import { Card } from '@/presentation/shared/components/Card';
import { colors, spacing } from '@/presentation/theme/tokens';

/**
 * Cuenta de cobro de la persona (COPAYNI-81), de solo lectura: la registra el equipo de Ayni con la
 * constancia que envía la persona. Si no carga, no se muestra: el resto de la pantalla sigue útil.
 */
export function PayoutAccountCard() {
  const { t } = useTranslation();
  const account = usePayoutAccount();
  if (!account.isSuccess) return null;

  return (
    <Card style={styles.card} testID="payout-account">
      <View style={styles.header}>
        <Ionicons
          name={account.data?.kind === 'wallet' ? 'wallet-outline' : 'business-outline'}
          size={20}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <AppText weight="semibold">{t('payment.settings.payoutAccount.title')}</AppText>
      </View>
      {account.data ? (
        <>
          <AppText variant="title" weight="semibold">
            {account.data.label}
          </AppText>
          <AppText color={colors.textSecondary}>
            {t('payment.settings.payoutAccount.registered', { holder: account.data.holderName })}
          </AppText>
          <AppText variant="caption" color={colors.neutral600}>
            {t('payment.settings.payoutAccount.changeHint')}
          </AppText>
        </>
      ) : (
        <>
          <AppText>{t('payment.settings.payoutAccount.missing')}</AppText>
          <AppText variant="caption" color={colors.neutral600}>
            {t('payment.settings.payoutAccount.missingHint')}
          </AppText>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
