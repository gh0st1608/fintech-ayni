import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOffline } from '@/presentation/query/connectivity';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

/**
 * Aviso de "sin conexión" para toda la app (pending-scope D10). Aparece arriba cuando una petición
 * falló por falta de red y se va con la primera respuesta del servidor. "Reintentar" vuelve a pedir
 * los datos de la pantalla abierta. No tapa el contenido: lo que ya estaba cargado sigue visible.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const offline = useOffline();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  if (!offline) return null;

  return (
    <View
      style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
    >
      <AppText variant="caption" color={colors.background} style={styles.message}>
        {t('connectivity.offline')}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => void queryClient.refetchQueries({ type: 'active' })}
        hitSlop={spacing.sm}
        style={styles.retry}
      >
        <AppText variant="caption" weight="semibold" color={colors.background}>
          {t('connectivity.retry')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.textPrimary,
  },
  message: { flex: 1 },
  retry: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
});
