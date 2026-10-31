import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { ReferralInvite } from '@/domain/referrals/Referral';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { MyReferralsSheet } from '../components/MyReferralsSheet';
import { useCopyReferralCode, useMyReferral, useShareInvite } from '../useReferrals';

const STEPS = [
  { key: 'invite', icon: 'paper-plane-outline' },
  { key: 'gift', icon: 'gift-outline' },
  { key: 'enjoy', icon: 'sparkles-outline' },
] as const;

/**
 * Refer a friend (COPAYNI-51): el beneficio, los 3 pasos, el código para copiar y la invitación
 * para compartir; "Ver mis invitaciones" abre My Referrals (COPAYNI-52). Sin el contexto de
 * diseño (límite de Figma): se armó con el inventario y los componentes existentes.
 */
export function ReferFriendScreen() {
  const { t } = useTranslation();
  const referral = useMyReferral();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (referral.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (referral.isError && !referral.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, referral.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void referral.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {referral.isError && (
          <InfoBanner message={t('referrals.offline')} testID="referral-offline" />
        )}
        <InviteContent invite={referral.data} />
        <ListItem
          title={t('referrals.track')}
          icon="people-outline"
          onPress={() => setSheetOpen(true)}
          testID="referral-track"
        />
      </ScrollView>
      <MyReferralsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}

function InviteContent({ invite }: { invite: ReferralInvite }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const copy = useCopyReferralCode();
  const share = useShareInvite();
  const amount = formatMoney(invite.reward, { trimZeroDecimals: true });

  const copyCode = () => copy.mutate(invite);
  const shareInvite = () =>
    share.mutate({ invite, message: t('referrals.share.message', { code: invite.code, amount }) });

  return (
    <>
      <AppText variant="title" weight="semibold" accessibilityRole="header">
        {t('referrals.headline', { amount })}
      </AppText>
      <View style={styles.steps}>
        {STEPS.map(({ key, icon }, index) => (
          <View key={key} style={styles.step} testID={`referral-step-${index + 1}`}>
            <Ionicons name={icon} size={24} color={colors.primary} />
            <View style={styles.stepText}>
              <AppText weight="semibold">{t(`referrals.steps.${key}.title`)}</AppText>
              <AppText variant="caption" color={colors.neutral500}>
                {t(`referrals.steps.${key}.description`, { amount })}
              </AppText>
            </View>
          </View>
        ))}
      </View>
      <Card testID="referral-code">
        <AppText variant="caption" color={colors.neutral500}>
          {t('referrals.code.label')}
        </AppText>
        <AppText variant="title" weight="semibold" style={styles.code} selectable>
          {invite.code}
        </AppText>
        <Button
          label={t('referrals.code.copy')}
          variant="secondary"
          loading={copy.isPending}
          onPress={copyCode}
        />
        {copy.isSuccess && (
          <AppText accessibilityLiveRegion="polite" color={colors.success} testID="referral-copied">
            {t('referrals.code.copied')}
          </AppText>
        )}
        {copy.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('referrals.code.copyFailed')}
          </AppText>
        )}
      </Card>
      <Button label={t('referrals.share.action')} loading={share.isPending} onPress={shareInvite} />
      {share.isError && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {t('referrals.share.failed')}
        </AppText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  steps: { gap: spacing.m },
  step: { flexDirection: 'row', gap: spacing.m, alignItems: 'flex-start' },
  stepText: { flex: 1, gap: spacing.xxs },
  code: { letterSpacing: 2 },
});
