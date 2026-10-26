import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { FieldError } from '@/presentation/shared/components/FieldError';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { AuthSheet } from '../components/AuthSheet';
import { useStartAuthentication } from '../hooks/useStartAuthentication';

interface SignInScreenProps {
  /** Se llama cuando el backend envió el OTP; la ruta navega a la verificación. */
  onChallengeStarted: (challenge: AuthChallenge) => void;
}

/** Enlace legal; sin URL configurada se muestra como texto (pending-scope L4). */
function LegalLink({ url, children }: { url?: string; children?: React.ReactNode }) {
  if (!url) {
    return (
      <AppText variant="caption" weight="semibold">
        {children}
      </AppText>
    );
  }
  return (
    <AppText
      variant="caption"
      weight="semibold"
      color={colors.primary}
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={styles.link}
    >
      {children}
    </AppText>
  );
}

/** Ingreso o registro con email o teléfono (Figma 55:10724): un mismo formulario sirve para ambos. */
export function SignInScreen({ onChallengeStarted }: SignInScreenProps) {
  const { t } = useTranslation();
  const { legal } = useContainer().config;
  const startAuthentication = useStartAuthentication();
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Tras el primer intento, el error del campo se recalcula en vivo con la regla del dominio.
  const fieldError =
    submitted && !LoginIdentifier.isValid(identifier)
      ? t('auth.signIn.invalidIdentifier')
      : undefined;
  const requestError = startAuthentication.error
    ? errorMessage(t, startAuthentication.error)
    : undefined;

  const submit = () => {
    if (startAuthentication.isPending) return;
    setSubmitted(true);
    if (!LoginIdentifier.isValid(identifier)) return;
    startAuthentication.mutate(identifier, { onSuccess: onChallengeStarted });
  };

  return (
    <AuthSheet>
      <View style={styles.form}>
        <View style={styles.header}>
          <AppText
            variant="title"
            weight="semibold"
            color={colors.primary}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            {t('common.appName')}
          </AppText>
          <AppText variant="title" weight="semibold" accessibilityRole="header">
            {t('auth.signIn.title')}
          </AppText>
          <AppText variant="caption" color={colors.neutral700} style={styles.centered}>
            {t('auth.signIn.subtitle')}
          </AppText>
        </View>

        <View style={styles.fields}>
          <TextField
            label={t('auth.signIn.identifierLabel')}
            placeholder={t('auth.signIn.identifierPlaceholder')}
            icon="mail-outline"
            value={identifier}
            onChangeText={setIdentifier}
            error={fieldError}
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!startAuthentication.isPending}
          />
          <Button
            label={t('common.continue')}
            onPress={submit}
            loading={startAuthentication.isPending}
          />
          <FieldError message={requestError} />
        </View>
      </View>

      <AppText variant="caption" style={[styles.centered, styles.legal]}>
        <Trans
          i18nKey="auth.signIn.legal"
          values={{ appName: t('common.appName') }}
          components={{
            terms: <LegalLink url={legal.termsUrl} />,
            privacy: <LegalLink url={legal.privacyUrl} />,
          }}
        />
      </AppText>
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  form: { flex: 1, gap: spacing.xl },
  header: { alignItems: 'center', gap: spacing.xs },
  centered: { textAlign: 'center' },
  fields: { gap: spacing.l },
  legal: { lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
});
