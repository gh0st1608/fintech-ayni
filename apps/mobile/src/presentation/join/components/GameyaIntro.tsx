import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Money } from '@/domain/shared/value-objects/Money';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { AppText } from '@/presentation/shared/components/AppText';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

/** Tarjetas del carrusel del diseño D16 aprobado (COPAYNI-87). */
const CARDS = [
  { key: 'noInterest', icon: 'cash-outline' },
  { key: 'yourTurn', icon: 'swap-vertical-outline' },
  { key: 'guarantee', icon: 'shield-checkmark-outline' },
] as const;

/** Duración del ejemplo de "¿Cómo funciona?": la del Figma (10 meses). */
const EXAMPLE_MONTHS = 10;
const CYCLE_STEPS = ['contribute', 'receive', 'repeat'] as const;

/**
 * Explica el Game'ya mientras se elige el monto (D16, COPAYNI-87): un carrusel de tres tarjetas
 * que se desliza a mano (nunca solo, así respeta "reducir movimiento") y la hoja "¿Cómo funciona
 * un Game'ya?" con un ejemplo en la moneda del círculo.
 */
export function GameyaIntro({ payout }: { payout: Money }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.intro} testID="gameya-intro">
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          testID="gameya-carousel"
        >
          {CARDS.map(({ key, icon }, index) => (
            <View
              key={key}
              style={[styles.card, { width }]}
              accessible
              accessibilityLabel={`${t(`join.payout.carousel.${key}.title`)}. ${t(
                `join.payout.carousel.${key}.description`,
              )}. ${t('join.payout.carousel.position', {
                current: index + 1,
                total: CARDS.length,
              })}`}
              testID={`gameya-card-${key}`}
            >
              <Ionicons name={icon} size={24} color={colors.primary} />
              <AppText weight="semibold">{t(`join.payout.carousel.${key}.title`)}</AppText>
              <AppText variant="caption" color={colors.neutral700}>
                {t(`join.payout.carousel.${key}.description`)}
              </AppText>
            </View>
          ))}
        </ScrollView>
      </View>
      <View
        style={styles.dots}
        accessibilityLabel={t('join.payout.carousel.position', {
          current: page + 1,
          total: CARDS.length,
        })}
        testID="gameya-carousel-dots"
      >
        {CARDS.map(({ key }, index) => (
          <View key={key} style={[styles.dot, index === page && styles.dotActive]} />
        ))}
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => setOpen(true)}
        hitSlop={spacing.sm}
        style={styles.link}
        testID="gameya-how-it-works"
      >
        <AppText weight="semibold" color={colors.primary}>
          {t('join.payout.howItWorks.link')}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
      <HowItWorksSheet payout={payout} visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function HowItWorksSheet({
  payout,
  visible,
  onClose,
}: {
  payout: Money;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const installment = Money.of(Math.round(payout.amount / EXAMPLE_MONTHS), payout.currency);
  return (
    <BottomSheet
      visible={visible}
      title={t('join.payout.howItWorks.title')}
      onClose={onClose}
      closeAccessibilityLabel={t('join.payout.howItWorks.close')}
      testID="gameya-how-it-works-sheet"
    >
      <View style={styles.sheet}>
        {CYCLE_STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText variant="caption" weight="semibold" color={colors.onPrimary}>
                {index + 1}
              </AppText>
            </View>
            <AppText style={styles.stepText}>{t(`join.payout.howItWorks.steps.${step}`)}</AppText>
          </View>
        ))}
        <View style={styles.example} testID="gameya-example">
          <AppText weight="semibold">{t('join.payout.howItWorks.exampleTitle')}</AppText>
          <AppText variant="caption" color={colors.neutral700}>
            {t('join.payout.howItWorks.example', {
              payout: formatMoney(payout, { trimZeroDecimals: true }),
              installment: formatMoney(installment, { trimZeroDecimals: true }),
              months: EXAMPLE_MONTHS,
            })}
          </AppText>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.m },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary100,
  },
  dots: { flexDirection: 'row', gap: spacing.xs, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.secondary200 },
  dotActive: { width: 18, backgroundColor: colors.primary },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
  },
  sheet: { gap: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.m, alignItems: 'flex-start' },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1 },
  example: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
});
