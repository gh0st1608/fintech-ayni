import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import type { Invitee, ReferralSummary } from '@/domain/referrals/Referral';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { Button } from '@/presentation/shared/components/Button';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useReferrals } from '../useReferrals';

interface MyReferralsSheetProps {
  visible: boolean;
  onClose: () => void;
}

const STATUS_TONE = {
  registered: 'subtle',
  joinedCircle: 'primary',
  firstPayInPaid: 'success',
} as const;

/** My Referrals (COPAYNI-52): ganado, canjeado y saldo, con los invitados y su estado. */
export function MyReferralsSheet({ visible, onClose }: MyReferralsSheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      visible={visible}
      title={t('referrals.mine.title')}
      closeAccessibilityLabel={t('referrals.mine.close')}
      onClose={onClose}
      testID="my-referrals-sheet"
    >
      {visible && <MyReferralsContent />}
    </BottomSheet>
  );
}

function MyReferralsContent() {
  const { t } = useTranslation();
  const referrals = useReferrals();

  if (referrals.isPending) {
    return <ActivityIndicator accessibilityLabel={t('common.loading')} />;
  }
  if (referrals.isError && !referrals.data) {
    return (
      <View style={styles.error}>
        <AppText accessibilityRole="alert">{errorMessage(t, referrals.error)}</AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => void referrals.refetch()}
        />
      </View>
    );
  }

  const pages = referrals.data.pages;
  const invitees = pages.flatMap((page) => page.invitees);
  return (
    <FlatList
      data={invitees}
      // El backend no expone un id del invitado: la posición y la fecha bastan para la lista.
      keyExtractor={(invitee, index) => `${index}-${invitee.claimedAt.toISOString()}`}
      renderItem={({ item }) => <InviteeRow invitee={item} />}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      testID="invitees-list"
      ListHeaderComponent={
        <View style={styles.header}>
          {referrals.isError && (
            <InfoBanner message={t('referrals.offline')} testID="referrals-offline" />
          )}
          <SummaryRow summary={pages[0]!.summary} />
          <AppText variant="caption" color={colors.neutral500}>
            {t('referrals.mine.autoApply')}
          </AppText>
          {invitees.length > 0 && (
            <AppText weight="semibold">{t('referrals.mine.invitees')}</AppText>
          )}
        </View>
      }
      ListEmptyComponent={<EmptyState title={t('referrals.mine.empty')} testID="invitees-empty" />}
      ListFooterComponent={
        referrals.isFetchingNextPage ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : undefined
      }
      onEndReached={() => {
        if (referrals.hasNextPage && !referrals.isFetchingNextPage) {
          void referrals.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
    />
  );
}

function SummaryRow({ summary }: { summary: ReferralSummary }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const items = [
    { key: 'earned', value: summary.earned },
    { key: 'redeemed', value: summary.redeemed },
    { key: 'balance', value: summary.balance },
  ] as const;
  return (
    <View style={styles.summary} testID="referrals-summary">
      {items.map(({ key, value }) => (
        <View key={key} style={styles.summaryItem} testID={`referrals-${key}`}>
          <AppText variant="caption" color={colors.neutral500}>
            {t(`referrals.mine.${key}`)}
          </AppText>
          <AppText weight="semibold">{formatMoney(value)}</AppText>
        </View>
      ))}
    </View>
  );
}

function InviteeRow({ invitee }: { invitee: Invitee }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const claimedOn = formatDate(invitee.claimedAt, 'date');
  return (
    <View style={styles.invitee} testID="invitee">
      <View style={styles.inviteeText}>
        <AppText weight="semibold">{invitee.displayName}</AppText>
        <AppText variant="caption" color={colors.neutral500}>
          {claimedOn}
        </AppText>
      </View>
      <Badge
        label={t(`referrals.mine.status.${invitee.status}`)}
        tone={STATUS_TONE[invitee.status]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  error: { gap: spacing.m },
  // La hoja crece con el contenido hasta un tope; la lista hace scroll dentro.
  list: { maxHeight: 480 },
  listContent: { gap: spacing.m },
  header: { gap: spacing.m },
  summary: { flexDirection: 'row', gap: spacing.m },
  summaryItem: { flex: 1, gap: spacing.xxs },
  invitee: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  inviteeText: { flex: 1, gap: spacing.xxs },
});
