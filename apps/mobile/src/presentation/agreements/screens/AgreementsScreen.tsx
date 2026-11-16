import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { AgreementStatus } from '@/domain/agreements/MembershipAgreement';
import { useAgreements } from '@/presentation/agreements/useAgreements';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

interface AgreementsScreenProps {
  /** Abre la firma de un acuerdo pendiente. */
  onOpen: (agreementId: string) => void;
}

const TONE = {
  pending: 'subtle',
  signed: 'successSubtle',
  expired: 'primary',
} as const satisfies Record<AgreementStatus, 'subtle' | 'successSubtle' | 'primary'>;

/**
 * Mis contratos y pagarés (COPAYNI-89): el estado de cada uno y, en los pendientes, hasta cuándo
 * hay plazo para firmar antes de que el turno se libere. Sin diseño propio en el Figma (D3 solo
 * cubre la pantalla de firma): se resuelve con el design system.
 */
export function AgreementsScreen({ onOpen }: AgreementsScreenProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const agreements = useAgreements();

  if (agreements.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (agreements.isError && !agreements.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, agreements.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void agreements.refetch()}
          />
        </View>
      </Screen>
    );
  }

  if (agreements.data.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          title={t('agreements.list.emptyTitle')}
          description={t('agreements.list.emptyDescription')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={agreements.isRefetching}
            onRefresh={() => void agreements.refetch()}
          />
        }
      >
        <AppText color={colors.neutral500}>{t('agreements.list.intro')}</AppText>
        {agreements.data.map((agreement) => (
          <Card
            key={agreement.id}
            onPress={agreement.status === 'pending' ? () => onOpen(agreement.id) : undefined}
            testID={`agreement-${agreement.id}`}
          >
            <View style={styles.heading}>
              <AppText weight="semibold" style={styles.title}>
                {t('agreements.list.item', { position: agreement.position })}
              </AppText>
              <Badge
                label={t(`agreements.status.${agreement.status}`)}
                tone={TONE[agreement.status]}
              />
            </View>
            <AppText variant="caption" color={colors.textSecondary} style={styles.note}>
              {agreement.status === 'pending'
                ? t('agreements.list.deadline', {
                    date: formatDate(agreement.expiresAt, 'dateTime'),
                  })
                : t(`agreements.list.note.${agreement.status}`, {
                    date: formatDate(agreement.signedAt ?? agreement.expiresAt, 'date'),
                  })}
            </AppText>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.m, paddingVertical: spacing.l },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  note: { marginTop: spacing.xs },
  title: { flex: 1 },
});
