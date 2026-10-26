import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import GLOW from '@assets/images/onboarding/welcome-glow.png';
import HAND from '@assets/images/onboarding/welcome-hand.webp';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { colors, spacing } from '@/presentation/theme/tokens';

/** Proporción de la ilustración exportada del Figma (Design 2, 55:10723). */
const HAND_ASPECT_RATIO = 1662 / 1299;

interface WelcomeScreenProps {
  /** Lleva al ingreso con email o teléfono; la ruta decide a dónde navegar. */
  onContinue: () => void;
}

/** Onboarding "Welcome to …" (Figma 55:10710). Se muestra solo sin sesión. */
export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const appName = t('common.appName');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image source={GLOW} style={[styles.glow, styles.glowTop]} accessibilityIgnoresInvertColors />
      <Image
        source={GLOW}
        style={[styles.glow, styles.glowBottom]}
        accessibilityIgnoresInvertColors
      />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <AppText
          variant="hero"
          weight="semibold"
          color={colors.background}
          style={styles.brand}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {appName}
        </AppText>

        <View style={styles.illustration} importantForAccessibility="no-hide-descendants">
          <Image
            source={HAND}
            resizeMode="contain"
            style={styles.hand}
            accessibilityIgnoresInvertColors
            testID="welcome-illustration"
          />
        </View>

        <View style={styles.copy}>
          <AppText
            variant="hero"
            weight="semibold"
            color={colors.background}
            accessibilityRole="header"
          >
            {t('welcome.title', { appName })}
          </AppText>
          <AppText
            variant="caption"
            weight="light"
            color={colors.secondary100}
            style={styles.subtitle}
          >
            {t('welcome.subtitle')}
          </AppText>
        </View>

        <View style={styles.actions}>
          <Button label={t('common.continue')} onPress={onContinue} />
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Brillos de fondo: lienzo de 1000.77 con el círculo de 549 centrado (Ellipse 1 y 2). */
const GLOW_SIZE = 1000.77;
const GLOW_INSET = (GLOW_SIZE - 549) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.inkBackground, overflow: 'hidden' },
  glow: { position: 'absolute', width: GLOW_SIZE, height: GLOW_SIZE },
  glowTop: { left: -298 - GLOW_INSET, top: -207 - GLOW_INSET },
  glowBottom: { left: 155 - GLOW_INSET, bottom: 852 - 547 - 549 - GLOW_INSET },
  safeArea: { flex: 1, paddingHorizontal: spacing.l, paddingBottom: spacing.lg },
  brand: { alignSelf: 'center', marginTop: spacing.xl },
  illustration: {
    flex: 1,
    marginTop: spacing.sm,
    marginRight: -spacing.l,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  hand: { height: '100%', aspectRatio: HAND_ASPECT_RATIO, mixBlendMode: 'hard-light' },
  copy: { gap: spacing.l },
  subtitle: { lineHeight: 20 },
  actions: { gap: spacing.m, marginTop: 40 },
});
