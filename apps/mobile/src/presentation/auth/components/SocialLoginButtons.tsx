import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SocialProvider } from '@/domain/auth/SocialLogin';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { FieldError } from '@/presentation/shared/components/FieldError';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { useAvailableProviders, useSocialLogin } from '../hooks/useSocialLogin';

const ICONS: Record<SocialProvider, React.ComponentProps<typeof Ionicons>['name']> = {
  google: 'logo-google',
  apple: 'logo-apple',
};

interface SocialLoginButtonsProps {
  /** Mientras el formulario de email o teléfono está trabajando, estos botones se desactivan. */
  disabled?: boolean;
}

/**
 * Entrar con Google o Apple (COPAYNI-91, D12). Se muestran solo los proveedores que el
 * dispositivo puede ofrecer: sin ninguno configurado, la sección no aparece y el ingreso con
 * email o teléfono queda igual que siempre.
 */
export function SocialLoginButtons({ disabled = false }: SocialLoginButtonsProps) {
  const { t } = useTranslation();
  const providers = useAvailableProviders();
  const login = useSocialLogin();

  if (!providers.data || providers.data.length === 0) return null;

  const busy = login.isPending || disabled;

  return (
    <View style={styles.section} testID="social-login">
      <View style={styles.separator}>
        <View style={styles.line} />
        <AppText variant="caption" color={colors.neutral700}>
          {t('auth.social.separator')}
        </AppText>
        <View style={styles.line} />
      </View>

      <View style={styles.buttons}>
        {providers.data.map((provider) => (
          <Pressable
            key={provider}
            accessibilityRole="button"
            accessibilityLabel={t(`auth.social.${provider}`)}
            accessibilityState={{ disabled: busy, busy: login.isPending }}
            disabled={busy}
            onPress={() => login.mutate(provider)}
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
            testID={`social-login-${provider}`}
          >
            <Ionicons name={ICONS[provider]} size={20} color={colors.textPrimary} />
            <AppText weight="semibold">{t(`auth.social.${provider}`)}</AppText>
          </Pressable>
        ))}
      </View>

      {/* Cancelar no deja mensaje: solo se avisa de lo que de verdad falló. */}
      <FieldError message={login.isError ? errorMessage(t, login.error) : undefined} />
      {login.data?.status === 'unsupported' && (
        <AppText variant="caption" color={colors.neutral700} style={styles.note}>
          {t('auth.social.unsupported')}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderColor: colors.borderNormal,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.l,
  },
  buttons: { gap: spacing.sm },
  line: { backgroundColor: colors.borderNormal, flex: 1, height: 1 },
  note: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  section: { gap: spacing.m },
  separator: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
