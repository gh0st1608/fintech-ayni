import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import NO_CARDS from '@assets/images/payment/no-cards.png';
import type { SavedCard } from '@/domain/payments/SavedCard';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { paymentErrorMessage } from '../paymentErrorMessage';
import { useCards, useRemoveCard, useSetDefaultCard } from '../useCards';

const RADIO_SIZE = 20;

/**
 * Saved Cards (Figma 55:10087 y 55:10144, COPAYNI-39): la tarjeta marcada cobra las cuotas. El
 * lápiz de editar del Figma no se muestra: una tarjeta tokenizada no se edita, se reemplaza.
 */
export function SavedCardsScreen({ onAddCard }: { onAddCard: () => void }) {
  const { t } = useTranslation();
  const cards = useCards();
  const setDefault = useSetDefaultCard();
  const remove = useRemoveCard();
  const failure = setDefault.error ?? remove.error;

  const confirmRemove = (card: SavedCard) =>
    Alert.alert(
      t('payment.cards.removeTitle'),
      t('payment.cards.removeMessage', { lastFour: card.lastFour }),
      [
        { text: t('payment.cards.cancel'), style: 'cancel' },
        {
          text: t('payment.cards.remove'),
          style: 'destructive',
          onPress: () => {
            setDefault.reset();
            remove.mutate(card.id);
          },
        },
      ],
    );

  if (cards.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (cards.isError && !cards.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, cards.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void cards.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} testID="saved-cards">
        {failure && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {paymentErrorMessage(t, failure)}
          </AppText>
        )}
        {cards.data.length === 0 ? (
          <EmptyState
            title={t('payment.cards.empty')}
            description={t('payment.cards.emptyDescription')}
            illustration={NO_CARDS}
            testID="cards-empty"
          />
        ) : (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('payment.cards.title')}
            style={styles.section}
          >
            <AppText variant="highlight" weight="semibold" accessibilityRole="header">
              {t('payment.cards.title')}
            </AppText>
            {cards.data.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onSelect={() => {
                  remove.reset();
                  setDefault.mutate(card.id);
                }}
                onRemove={() => confirmRemove(card)}
                busy={
                  (setDefault.isPending && setDefault.variables === card.id) ||
                  (remove.isPending && remove.variables === card.id)
                }
              />
            ))}
          </View>
        )}
        <View style={[styles.section, cards.data.length > 0 && styles.divided]}>
          <AppText variant="highlight" weight="semibold" accessibilityRole="header">
            {t('payment.cards.addNew')}
          </AppText>
          <ListItem
            title={t('payment.cards.add')}
            description={t('payment.cards.brands')}
            icon="card-outline"
            onPress={onAddCard}
            testID="cards-add"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

interface CardRowProps {
  card: SavedCard;
  onSelect: () => void;
  onRemove: () => void;
  busy: boolean;
}

/** Fila del Figma: radio de la tarjeta de cobro, marca, número enmascarado y eliminar. */
function CardRow({ card, onSelect, onRemove, busy }: CardRowProps) {
  const { t } = useTranslation();
  const masked = t('payment.cards.masked', {
    brand: card.brand.toUpperCase(),
    lastFour: card.lastFour,
  });
  return (
    <View style={styles.row} testID={`card-${card.id}`}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={masked}
        accessibilityHint={t('payment.cards.defaultHint')}
        accessibilityState={{ checked: card.isDefault, busy }}
        disabled={card.isDefault || busy}
        onPress={onSelect}
        style={styles.select}
      >
        <View style={[styles.radio, card.isDefault && styles.radioChecked]}>
          {card.isDefault && <View style={styles.radioDot} />}
        </View>
        <AppText weight="semibold">{masked}</AppText>
      </Pressable>
      {busy ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('payment.cards.removeLabel', { lastFour: card.lastFour })}
          onPress={onRemove}
          hitSlop={spacing.sm}
          style={styles.remove}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { flexGrow: 1, gap: spacing.l, paddingVertical: spacing.l },
  section: { gap: spacing.m },
  divided: {
    paddingTop: spacing.l,
    borderTopWidth: 1,
    borderTopColor: colors.secondary100,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  select: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.neutral500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: { borderColor: colors.primary },
  radioDot: {
    width: RADIO_SIZE / 2,
    height: RADIO_SIZE / 2,
    borderRadius: RADIO_SIZE / 4,
    backgroundColor: colors.primary,
  },
  remove: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
