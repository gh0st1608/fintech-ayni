import { Trans, useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import INVITE from '@assets/images/referrals/step-invite.png';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { AppText } from '@/presentation/shared/components/AppText';
import { Chevron } from '@/presentation/shared/components/Chevron';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { useMyReferral } from '../useReferrals';

/**
 * Banner de invitación del Home (Figma 55:8637): el beneficio sale de mi código (COPAYNI-51).
 * Mientras carga o si falla, no se muestra: no bloquea el resto del Home.
 */
export function ReferralBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const referral = useMyReferral();
  if (!referral.data) return null;

  const amount = formatMoney(referral.data.reward, { trimZeroDecimals: true });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('referrals.banner.label', { amount })}
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      testID="home-referral-banner"
    >
      <Image
        source={INVITE}
        style={styles.image}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.text}>
        <AppText variant="caption">
          <Trans
            i18nKey="referrals.banner.text"
            values={{ amount }}
            components={{ amount: <AppText variant="caption" weight="semibold" /> }}
          />
        </AppText>
      </View>
      <Chevron />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
    borderRadius: radius.md,
    backgroundColor: colors.primary100,
  },
  pressed: { opacity: 0.85 },
  image: { width: 40, height: 40 },
  text: { flex: 1 },
});
