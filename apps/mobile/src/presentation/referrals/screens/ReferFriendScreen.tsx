import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import STEP_DISCOUNT from '@assets/images/referrals/step-discount.png';
import STEP_GIFT from '@assets/images/referrals/step-gift.png';
import STEP_INVITE from '@assets/images/referrals/step-invite.png';
import type { ReferralInvite } from '@/domain/referrals/Referral';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { MyReferralsSheet } from '../components/MyReferralsSheet';
import { useCopyReferralCode, useMyReferral, useShareInvite } from '../useReferrals';

const STEPS = [
  { key: 'invite', image: STEP_INVITE },
  { key: 'gift', image: STEP_GIFT },
  { key: 'enjoy', image: STEP_DISCOUNT },
] as const;
const STEP_ICON_SIZE = 40;

/**
 * Refer a friend (Figma 55:10419, COPAYNI-51): el beneficio, el acceso a My Referrals
 * (COPAYNI-52), los 3 pasos, copiar el código y compartir la invitación.
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
      <InviteContent
        invite={referral.data}
        offline={referral.isError}
        onTrack={() => setSheetOpen(true)}
      />
      <MyReferralsSheet
        visible={sheetOpen}
        reward={referral.data.reward}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

interface InviteContentProps {
  invite: ReferralInvite;
  offline: boolean;
  onTrack: () => void;
}

function InviteContent({ invite, offline, onTrack }: InviteContentProps) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const copy = useCopyReferralCode();
  const share = useShareInvite();
  const amount = formatMoney(invite.reward, { trimZeroDecimals: true });

  const shareInvite = () =>
    share.mutate({ invite, message: t('referrals.share.message', { code: invite.code, amount }) });

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {offline && <InfoBanner message={t('referrals.offline')} testID="referral-offline" />}
        <View style={styles.header}>
          <AppText variant="title" weight="semibold" accessibilityRole="header">
            {t('referrals.headline', { amount })}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={onTrack}
            hitSlop={spacing.sm}
            style={styles.link}
            testID="referral-track"
          >
            <AppText variant="caption" color={colors.primary}>
              {t('referrals.track')}
            </AppText>
            <Ionicons name="arrow-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>
        <View>
          {STEPS.map(({ key, image }, index) => (
            <View key={key} style={styles.step} testID={`referral-step-${index + 1}`}>
              {/* Figma: los iconos se unen con una línea punteada. */}
              <View style={styles.stepRail}>
                <Image
                  source={image}
                  style={styles.stepIcon}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                {index < STEPS.length - 1 && <View style={styles.connector} />}
              </View>
              <View style={styles.stepText}>
                <AppText variant="highlight" weight="semibold">
                  {t('referrals.steps.numbered', {
                    number: index + 1,
                    title: t(`referrals.steps.${key}.title`),
                  })}
                </AppText>
                <AppText variant="caption" color={colors.neutral500}>
                  {t(`referrals.steps.${key}.description`, { amount })}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('referrals.code.copyLabel', { code: invite.code })}
          onPress={() => copy.mutate(invite)}
          disabled={copy.isPending}
          style={styles.copy}
          testID="referral-code"
        >
          <AppText variant="caption" weight="semibold" color={colors.primary}>
            {t('referrals.code.copy', { code: invite.code })}
          </AppText>
          <Ionicons name="copy-outline" size={20} color={colors.primary} />
        </Pressable>
        {copy.isSuccess && (
          <AppText
            variant="caption"
            accessibilityLiveRegion="polite"
            color={colors.success}
            style={styles.centerText}
            testID="referral-copied"
          >
            {t('referrals.code.copied')}
          </AppText>
        )}
        {copy.isError && (
          <AppText
            variant="caption"
            accessibilityRole="alert"
            color={colors.error}
            style={styles.centerText}
          >
            {t('referrals.code.copyFailed')}
          </AppText>
        )}
        {share.isError && (
          <AppText
            variant="caption"
            accessibilityRole="alert"
            color={colors.error}
            style={styles.centerText}
          >
            {t('referrals.share.failed')}
          </AppText>
        )}
        <Button
          label={t('referrals.share.action')}
          loading={share.isPending}
          onPress={shareInvite}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  header: { gap: spacing.m },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  step: { flexDirection: 'row', gap: spacing.m },
  stepRail: { width: STEP_ICON_SIZE, alignItems: 'center' },
  stepIcon: { width: STEP_ICON_SIZE, height: STEP_ICON_SIZE },
  connector: {
    flex: 1,
    width: 0,
    minHeight: spacing.l,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  stepText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.xl },
  footer: { gap: spacing.l },
  copy: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
