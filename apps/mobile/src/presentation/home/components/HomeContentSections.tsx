import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { type HomeIllustration, type HomeItem, isPressable } from '@/domain/home/HomeContent';
import { useHomeContent } from '@/presentation/home/useHomeContent';
import { AppText } from '@/presentation/shared/components/AppText';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

/**
 * Hasta que UX entregue las ilustraciones (BO4), cada clave del catálogo se dibuja con el icono
 * del design system que le corresponde. El contrato no cambia cuando lleguen los archivos.
 */
const ICONS: Record<HomeIllustration, React.ComponentProps<typeof Ionicons>['name']> = {
  megaphone: 'megaphone-outline',
  gift: 'gift-outline',
  piggyBank: 'wallet-outline',
  calendar: 'calendar-outline',
  school: 'school-outline',
  home: 'home-outline',
  travel: 'airplane-outline',
  celebration: 'sparkles-outline',
};

/** Fondos del design system; un token desconocido cae al neutro en vez de romper la tarjeta. */
const BACKGROUNDS: Record<string, string> = {
  cream: '#FDF3E3',
  blush: '#FDE8EC',
  mint: colors.success100,
  lilac: '#EDEAFB',
  primary: colors.primary,
  orange: colors.streak,
  green: colors.success,
};

const onColor = (background: string): string =>
  background === 'primary' || background === 'orange' || background === 'green'
    ? colors.onPrimary
    : colors.textPrimary;

export interface HomeContentProps {
  /** A dónde lleva cada destino; la ruta lo decide, no la sección. */
  onOpen: (item: HomeItem) => void;
}

/**
 * "Latest Offers" (Figma 55:8637): carrusel de láminas con puntos de página. Tiene su propia
 * query, así que un error aquí no bloquea el resto de Home, y sin ofertas no se muestra nada:
 * es contenido de campaña, no información que la persona necesite.
 */
export function HomeOffers({ onOpen }: HomeContentProps) {
  const { t } = useTranslation();
  const content = useHomeContent();
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width - spacing.l * 2);
  const [page, setPage] = useState(0);
  const offers = content.data?.offers ?? [];

  if (offers.length === 0) return null;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + spacing.sm));
    setPage(next);
  };

  return (
    <View style={styles.section} testID="home-offers">
      <FlatList
        horizontal
        data={offers}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.sm}
        decelerationRate="fast"
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole={isPressable(item) ? 'button' : undefined}
            accessibilityLabel={item.title}
            accessibilityHint={item.subtitle ?? undefined}
            disabled={!isPressable(item)}
            onPress={() => onOpen(item)}
            style={[
              styles.offer,
              { width: cardWidth, backgroundColor: BACKGROUNDS[item.background] ?? colors.surface },
            ]}
            testID={`home-offer-${item.id}`}
          >
            <View style={styles.offerText}>
              {item.subtitle && (
                <AppText variant="caption" color={colors.textSecondary}>
                  {item.subtitle}
                </AppText>
              )}
              <AppText variant="title" weight="semibold">
                {item.title}
              </AppText>
            </View>
            <Ionicons name={ICONS[item.illustration]} size={56} color={colors.primary} />
          </Pressable>
        )}
      />
      {offers.length > 1 && (
        <View
          style={styles.dots}
          accessibilityRole="progressbar"
          accessibilityLabel={t('home.content.offersPage', {
            page: page + 1,
            total: offers.length,
          })}
        >
          {offers.map((offer, index) => (
            <View key={offer.id} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * "Popular Goals" (Figma 55:8637): tarjetas de colores con un atajo a lo que se puede hacer hoy.
 * Sin metas cargadas, la sección no aparece.
 */
export function HomeGoals({ onOpen }: HomeContentProps) {
  const { t } = useTranslation();
  const content = useHomeContent();
  const goals = content.data?.goals ?? [];

  if (goals.length === 0) return null;

  return (
    <View style={styles.section} testID="home-goals">
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {t('home.content.goalsTitle')}
      </AppText>
      <FlatList
        horizontal
        data={goals}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => {
          const background = BACKGROUNDS[item.background] ?? colors.primary;
          const text = onColor(item.background);
          return (
            <Pressable
              accessibilityRole={isPressable(item) ? 'button' : undefined}
              accessibilityLabel={item.title}
              accessibilityHint={item.subtitle ?? undefined}
              disabled={!isPressable(item)}
              onPress={() => onOpen(item)}
              style={[styles.goal, { backgroundColor: background }]}
              testID={`home-goal-${item.id}`}
            >
              <View style={styles.goalText}>
                <AppText weight="semibold" color={text}>
                  {item.title}
                </AppText>
                {item.subtitle && (
                  <AppText variant="caption" color={text}>
                    {item.subtitle}
                  </AppText>
                )}
              </View>
              <Ionicons name={ICONS[item.illustration]} size={28} color={text} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: colors.secondary200,
    borderRadius: radius.full,
    height: 6,
    width: 6,
  },
  dotActive: { backgroundColor: colors.primary, width: 16 },
  dots: { alignSelf: 'center', flexDirection: 'row', gap: spacing.xs },
  goal: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    padding: spacing.m,
    width: 220,
  },
  goalText: { flex: 1, gap: spacing.xxs },
  offer: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 120,
    padding: spacing.l,
  },
  offerText: { flex: 1, gap: spacing.xxs },
  row: { gap: spacing.sm, paddingHorizontal: spacing.l },
  section: { gap: spacing.sm, marginHorizontal: -spacing.l },
});
