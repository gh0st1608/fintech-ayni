import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { Toggle } from '@/presentation/shared/components/Toggle';
import { colors, spacing } from '@/presentation/theme/tokens';

import { usePaymentSettings, useUpdatePaymentSettings } from '../usePayments';

interface PaymentSettingsScreenProps {
  onChangePayoutMethod: () => void;
  /** Tarjetas guardadas (COPAYNI-39); sin pantalla todavía, el acceso queda deshabilitado. */
  onOpenSavedCards?: () => void;
}

/**
 * Payment Settings (Figma 55:10052, COPAYNI-38): deducir el pay-in del payout y accesos a
 * "Change Payout Method" y "Saved Cards", cada uno con la descripción del Figma.
 */
export function PaymentSettingsScreen({
  onChangePayoutMethod,
  onOpenSavedCards,
}: PaymentSettingsScreenProps) {
  const { t } = useTranslation();
  const settings = usePaymentSettings();
  const update = useUpdatePaymentSettings();

  let toggle: React.ReactNode;
  if (settings.isPending) {
    toggle = <ActivityIndicator accessibilityLabel={t('common.loading')} />;
  } else if (settings.isError && !settings.data) {
    toggle = (
      <View style={styles.error}>
        <AppText accessibilityRole="alert">{errorMessage(t, settings.error)}</AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => void settings.refetch()}
        />
      </View>
    );
  } else {
    toggle = (
      <Toggle
        label={t('payment.settings.deduct')}
        description={t('payment.settings.deductDescription')}
        value={settings.data.deductPayInFromPayout}
        disabled={update.isPending}
        onValueChange={(value) => update.mutate({ deductPayInFromPayout: value })}
        testID="deduct-toggle"
      />
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {toggle}
        {update.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('payment.settings.saveError', { reason: errorMessage(t, update.error) })}
          </AppText>
        )}
        <ListItem
          title={t('payment.settings.changePayoutMethod')}
          description={t('payment.settings.changePayoutMethodDescription')}
          icon="wallet-outline"
          onPress={onChangePayoutMethod}
          testID="settings-payout-method"
        />
        <ListItem
          title={t('payment.settings.savedCards')}
          description={
            onOpenSavedCards ? t('payment.settings.savedCardsDescription') : t('common.comingSoon')
          }
          icon="card-outline"
          onPress={onOpenSavedCards}
          disabled={!onOpenSavedCards}
          testID="settings-saved-cards"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.m, paddingVertical: spacing.l },
  error: { gap: spacing.m },
});
