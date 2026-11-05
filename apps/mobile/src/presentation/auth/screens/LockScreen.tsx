import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { UnlockResult } from '@/application/auth/usecases/biometricUseCases';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

/**
 * Desbloqueo de una sesión guardada (COPAYNI-22). Sin diseño en el Figma (pending-scope D9). Pide la
 * biometría al abrirse y, tras fallos repetidos, ofrece volver a ingresar con un código.
 */
export function LockScreen() {
  const { t } = useTranslation();
  const { unlockWithBiometrics } = useContainer().auth;
  const { completeSignIn, signOut } = useSession();
  const failures = useRef(0);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(true);

  const attempt = useCallback(
    () =>
      unlockWithBiometrics.execute(
        { message: t('auth.locked.prompt'), cancelLabel: t('common.cancel') },
        failures.current,
      ),
    [t, unlockWithBiometrics],
  );

  const apply = useCallback(
    (result: UnlockResult) => {
      setBusy(false);
      if (result.status === 'unlocked') {
        completeSignIn('authenticated');
      } else if (result.status === 'fallback') {
        setFallback(true);
      } else {
        setFailed(result.failures > failures.current);
        failures.current = result.failures;
      }
    },
    [completeSignIn],
  );

  useEffect(() => {
    void attempt().then(apply);
  }, [apply, attempt]);

  const retry = () => {
    setBusy(true);
    void attempt().then(apply);
  };

  return (
    <Screen style={styles.content} testID="lock-screen">
      <View style={styles.text}>
        <AppText variant="title" weight="semibold" accessibilityRole="header">
          {t('auth.locked.title')}
        </AppText>
        <AppText color={colors.neutral500}>
          {t(fallback ? 'auth.locked.fallback' : 'auth.locked.subtitle')}
        </AppText>
        {failed && !fallback && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('auth.locked.failed')}
          </AppText>
        )}
      </View>
      {fallback ? (
        <Button label={t('auth.locked.useCode')} onPress={() => void signOut()} />
      ) : (
        <Button label={t('auth.locked.unlock')} loading={busy} onPress={retry} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.xl },
  text: { gap: spacing.sm },
});
