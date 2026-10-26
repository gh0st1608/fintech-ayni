import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

type Tone = 'primary' | 'success' | 'subtle';

const TONES: Record<Tone, { background: string; text: string }> = {
  primary: { background: colors.primary, text: colors.onPrimary },
  success: { background: colors.success, text: colors.onPrimary },
  subtle: { background: colors.primary100, text: colors.primary },
};

interface BadgeProps {
  label: string;
  tone?: Tone;
}

/** Etiqueta corta del Figma: "No Charge" (primary), "New" (success), "Joined" (subtle). */
export function Badge({ label, tone = 'primary' }: BadgeProps) {
  const { background, text } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <AppText variant="footnote" weight="semibold" color={text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.s,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
});
