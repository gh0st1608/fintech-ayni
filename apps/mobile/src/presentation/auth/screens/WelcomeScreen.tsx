import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

/**
 * Bienvenida provisional: el onboarding definitivo es COPAYNI-18 y el ingreso con OTP, COPAYNI-19/20.
 * El acceso demo existe solo en el ambiente dev para recorrer el shell de navegación.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const { environment } = useContainer().config;

  return (
    <Screen edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.copy}>
        <AppText variant="display" weight="semibold" accessibilityRole="header">
          {t('welcome.title', { appName: t('common.appName') })}
        </AppText>
        <AppText variant="highlight" color={colors.neutral500}>
          {t('welcome.subtitle')}
        </AppText>
      </View>
      {environment === 'dev' && (
        <Button
          label={t('welcome.devEnter')}
          onPress={() => signIn({ accessToken: 'dev-demo', refreshToken: 'dev-demo' })}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between' },
  copy: { flex: 1, justifyContent: 'center', gap: spacing.m },
});
