import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Chevron } from './Chevron';

interface InfoBannerProps {
  message: string;
  illustration?: ImageSourcePropType;
  /** Enlace opcional ("Learn More"). */
  link?: { label: string; onPress: () => void };
  testID?: string;
}

/** Aviso informativo del Figma (fondo primary100, ilustración a la derecha y enlace opcional). */
export function InfoBanner({ message, illustration, link, testID }: InfoBannerProps) {
  return (
    <View style={styles.banner} testID={testID}>
      <View style={styles.text}>
        <AppText>{message}</AppText>
        {link && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={link.onPress}
            hitSlop={spacing.sm}
            style={styles.link}
          >
            <AppText weight="semibold" color={colors.primary}>
              {link.label}
            </AppText>
            <Chevron color={colors.primary} />
          </Pressable>
        )}
      </View>
      {illustration && (
        <Image
          source={illustration}
          style={styles.illustration}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary100,
  },
  text: { flex: 1, gap: spacing.sm },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: MIN_TOUCH_TARGET / 2,
    alignSelf: 'flex-start',
  },
  illustration: { width: 48, height: 48 },
});
