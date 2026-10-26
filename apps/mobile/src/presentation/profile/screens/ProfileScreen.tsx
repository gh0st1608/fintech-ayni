import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';

/** Perfil: el contenido completo se implementa en COPAYNI-44; aquí solo el cierre de sesión. */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { signOut } = useSession();

  return (
    <Screen>
      <AppText variant="title" weight="semibold" accessibilityRole="header">
        {t('tabs.profile')}
      </AppText>
      <View style={styles.footer}>
        <Button variant="secondary" label={t('profile.logout')} onPress={signOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, justifyContent: 'flex-end' },
});
