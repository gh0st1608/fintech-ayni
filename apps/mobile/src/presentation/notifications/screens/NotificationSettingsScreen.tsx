import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';

import type { NotificationCategory } from '@/domain/notifications/Notification';
import { PREFERENCE_CATEGORIES } from '@/domain/notifications/PushRegistration';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import {
  useEnablePush,
  useNotificationPreferences,
  usePushPermission,
  useSaveNotificationPreferences,
} from '@/presentation/notifications/usePush';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { Toggle } from '@/presentation/shared/components/Toggle';
import { colors, spacing } from '@/presentation/theme/tokens';

/**
 * Ajustes de los avisos en el celular (COPAYNI-85). Apagar una categoría deja de interrumpir: la
 * bandeja sigue mostrando todo, así que nadie se pierde un vencimiento por apagar el aviso.
 *
 * Con el permiso del sistema operativo denegado los interruptores no cambian nada: se explica y se
 * ofrece abrir los ajustes del teléfono, el único lugar donde se puede volver a conceder.
 */
export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const preferences = useNotificationPreferences();
  const permission = usePushPermission();
  const save = useSaveNotificationPreferences();
  const enable = useEnablePush();

  if (preferences.isPending) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  if (!preferences.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, preferences.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void preferences.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const current = preferences.data;
  const blocked = permission.data === 'denied';
  const askable = permission.data === 'undetermined';

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color={colors.textSecondary}>{t('notifications.settings.intro')}</AppText>

        {blocked && (
          <>
            <InfoBanner
              message={t('notifications.settings.permissionDenied')}
              testID="push-permission-denied"
            />
            <Button
              label={t('notifications.settings.openSystemSettings')}
              variant="secondary"
              onPress={() => void Linking.openSettings()}
              testID="push-open-settings"
            />
          </>
        )}
        {askable && (
          <Card style={styles.card}>
            <AppText>{t('notifications.settings.permissionAsk')}</AppText>
            <Button
              label={t('notifications.settings.enable')}
              onPress={() => enable.mutate()}
              loading={enable.isPending}
              testID="push-enable"
            />
          </Card>
        )}

        <Card style={styles.card}>
          <Toggle
            label={t('notifications.settings.pushEnabled')}
            description={t('notifications.settings.pushEnabledDescription')}
            value={current.pushEnabled}
            disabled={blocked || save.isPending}
            onValueChange={(value) => save.mutate({ pushEnabled: value })}
            testID="push-enabled"
          />
        </Card>

        <Card style={styles.card}>
          <AppText weight="semibold">{t('notifications.settings.categoriesTitle')}</AppText>
          {PREFERENCE_CATEGORIES.map((category: NotificationCategory) => (
            <Toggle
              key={category}
              label={t(`notifications.settings.categories.${category}.label`)}
              description={t(`notifications.settings.categories.${category}.description`)}
              value={current.categories[category]}
              // Con el interruptor general apagado, las categorías no cambian nada.
              disabled={blocked || !current.pushEnabled || save.isPending}
              onValueChange={(value) => save.mutate({ categories: { [category]: value } })}
              testID={`push-category-${category}`}
            />
          ))}
        </Card>

        {save.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {errorMessage(t, save.error)}
          </AppText>
        )}
        <AppText variant="caption" color={colors.neutral500}>
          {t('notifications.settings.inboxNote')}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.l },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
