import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useUnreadNotifications } from '@/presentation/notifications/useNotifications';
import { colors, MIN_TOUCH_TARGET } from '@/presentation/theme/tokens';

/** La campana del header de Home (D6): un punto si hay notificaciones sin leer (COPAYNI-84). */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const unread = useUnreadNotifications();
  const count = unread.data ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? t('notifications.bellUnreadA11y', { count }) : t('notifications.bellA11y')
      }
      onPress={onPress}
      style={styles.button}
      testID="notification-bell"
    >
      <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
      {count > 0 && <View style={styles.dot} testID="notification-dot" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
});
