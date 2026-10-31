import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { PayoutRequirement, RequirementStatus } from '@/domain/payments/PayoutEligibility';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { usePayoutEligibility } from '../usePayments';

interface PayoutEligibilityScreenProps {
  /** Acción de cada requisito pendiente; sin ella, el requisito no es pulsable. */
  actions: Partial<Record<PayoutRequirement, () => void>>;
}

const STATUS_ICON = {
  met: { name: 'checkmark-circle', color: colors.success },
  pending: { name: 'alert-circle-outline', color: colors.error },
  unavailable: { name: 'time-outline', color: colors.neutral500 },
} as const satisfies Record<RequirementStatus, { name: string; color: string }>;

/**
 * Payout Eligibility (Figma 55:9892, COPAYNI-36): checklist de National ID, Insurance Note,
 * Payout Method, Contract y Due Payments con su estado (✔ o ⚠) y la acción que lo corrige. El
 * backend calcula cada requisito. Como en el Figma, Due Payments va aparte, con su estado a la
 * derecha.
 */
export function PayoutEligibilityScreen({ actions }: PayoutEligibilityScreenProps) {
  const { t } = useTranslation();
  const eligibility = usePayoutEligibility();

  if (eligibility.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (eligibility.isError && !eligibility.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, eligibility.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void eligibility.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const { isEligible, requirements } = eligibility.data;
  const checklist = requirements.filter(({ requirement }) => requirement !== 'duePayments');
  const duePayments = requirements.find(({ requirement }) => requirement === 'duePayments');
  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={eligibility.isRefetching}
            onRefresh={() => void eligibility.refetch()}
          />
        }
      >
        <AppText testID="eligibility-status" weight="semibold">
          {t(isEligible ? 'payment.eligibility.eligible' : 'payment.eligibility.notEligible')}
        </AppText>
        {checklist.map(({ requirement, status }) => {
          const action = status === 'pending' ? actions[requirement] : undefined;
          const icon = STATUS_ICON[status];
          return (
            <ListItem
              key={requirement}
              title={t(`payment.eligibility.requirements.${requirement}`)}
              description={t(`payment.eligibility.descriptions.${requirement}`)}
              icon={icon.name}
              iconColor={icon.color}
              accessibilityHint={t(`payment.eligibility.status.${status}`)}
              onPress={action}
              testID={`requirement-${requirement}`}
            />
          );
        })}
        {duePayments && (
          <View style={styles.divided}>
            <ListItem
              title={t('payment.eligibility.requirements.duePayments')}
              icon="card-outline"
              accessibilityHint={t(`payment.eligibility.status.${duePayments.status}`)}
              onPress={duePayments.status === 'pending' ? actions.duePayments : undefined}
              trailing={
                <Ionicons
                  name={STATUS_ICON[duePayments.status].name}
                  size={24}
                  color={STATUS_ICON[duePayments.status].color}
                />
              }
              testID="requirement-duePayments"
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.m, paddingVertical: spacing.l },
  divided: { paddingTop: spacing.l, borderTopWidth: 1, borderTopColor: colors.secondary100 },
});
