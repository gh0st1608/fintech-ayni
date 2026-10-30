import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';

import type { SavedCard } from '@/domain/payments/SavedCard';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { paymentErrorMessage } from '../paymentErrorMessage';
import { useCards, useRemoveCard, useSetDefaultCard } from '../useCards';

/**
 * Saved Cards (COPAYNI-39): la predeterminada cobra las cuotas. Sin el contexto de diseño
 * (límite de Figma): se armó con el inventario y los componentes existentes.
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

  let body: React.ReactNode;
  if (cards.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (cards.isError && !cards.data) {
    body = (
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
    );
  } else {
    body = (
      <FlatList
        data={cards.data}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.list}
        testID="saved-cards"
        ListHeaderComponent={
          failure ? (
            <AppText accessibilityRole="alert" color={colors.error}>
              {paymentErrorMessage(t, failure)}
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={<EmptyState title={t('payment.cards.empty')} testID="cards-empty" />}
        renderItem={({ item }) => (
          <Card testID={`card-${item.id}`} style={styles.card}>
            <View style={styles.cardHeader}>
              <AppText weight="semibold">
                {t('payment.cards.masked', {
                  brand: item.brand.toUpperCase(),
                  lastFour: item.lastFour,
                })}
              </AppText>
              {item.isDefault && <Badge label={t('payment.cards.default')} tone="subtle" />}
            </View>
            <AppText variant="caption" color={colors.neutral500}>
              {t('payment.cards.expires', {
                month: String(item.expirationMonth).padStart(2, '0'),
                year: item.expirationYear,
              })}
            </AppText>
            <View style={styles.actions}>
              {!item.isDefault && (
                <Button
                  label={t('payment.cards.makeDefault')}
                  variant="secondary"
                  loading={setDefault.isPending && setDefault.variables === item.id}
                  onPress={() => {
                    remove.reset();
                    setDefault.mutate(item.id);
                  }}
                  style={styles.action}
                />
              )}
              <Button
                label={t('payment.cards.remove')}
                variant="secondary"
                loading={remove.isPending && remove.variables === item.id}
                onPress={() => confirmRemove(item)}
                style={styles.action}
              />
            </View>
          </Card>
        )}
      />
    );
  }

  return (
    <Screen edges={['bottom']}>
      {body}
      <Button label={t('payment.cards.add')} onPress={onAddCard} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  list: { flexGrow: 1, gap: spacing.m, paddingVertical: spacing.l },
  card: { gap: spacing.xs },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.m, marginTop: spacing.sm },
  action: { flex: 1 },
});
