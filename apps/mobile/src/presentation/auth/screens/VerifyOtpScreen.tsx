import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { OTP_LENGTH } from '@/domain/auth/value-objects/OtpCode';
import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Checkbox } from '@/presentation/shared/components/Checkbox';
import { OTPInput } from '@/presentation/shared/components/OTPInput';
import { formatCountdown, useCountdown } from '@/presentation/shared/hooks/useCountdown';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { AuthSheet } from '../components/AuthSheet';
import { useResendOtp, useVerifyOtp } from '../hooks/useOtpVerification';

interface VerifyOtpScreenProps {
  challenge: AuthChallenge;
}

function rejectionMessage(t: TFunction, error: OtpVerificationError): string {
  if (error.reason === 'expired') return t('auth.verifyOtp.expired');
  if (error.reason === 'attempts_exceeded') return t('auth.verifyOtp.attemptsExceeded');
  return error.attemptsRemaining === undefined
    ? t('auth.verifyOtp.invalid')
    : t('auth.verifyOtp.invalidWithAttempts', { count: error.attemptsRemaining });
}

/**
 * Verify OTP (Figma 55:10749): verifica al completar el 4.º dígito. Al acertar, el
 * SessionProvider pasa a `authenticated` y la navegación protegida lleva a Home.
 */
export function VerifyOtpScreen({ challenge: initialChallenge }: VerifyOtpScreenProps) {
  const { t } = useTranslation();
  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();
  const [challenge, setChallenge] = useState(initialChallenge);
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const secondsToResend = useCountdown(challenge.resendAvailableAt);

  const verify = (value: string) => {
    if (verifyOtp.isPending) return;
    verifyOtp.mutate(
      { challengeId: challenge.challengeId, code: value, rememberMe },
      {
        // Un código rechazado se borra; ante un fallo de red se conserva para reintentar.
        onError: (error) => {
          if (error instanceof OtpVerificationError) setCode('');
        },
      },
    );
  };

  const resend = () => {
    if (secondsToResend > 0 || resendOtp.isPending) return;
    verifyOtp.reset();
    setCode('');
    resendOtp.mutate(challenge.challengeId, { onSuccess: setChallenge });
  };

  const error = verifyOtp.error ?? resendOtp.error;
  const message =
    error instanceof OtpVerificationError
      ? rejectionMessage(t, error)
      : error
        ? errorMessage(t, error)
        : undefined;
  const canRetry =
    verifyOtp.error instanceof AppError &&
    verifyOtp.error.isTransient &&
    code.length === OTP_LENGTH;
  const resendLocked = secondsToResend > 0 || resendOtp.isPending;

  return (
    <AuthSheet>
      <View style={styles.header}>
        <AppText variant="title" weight="semibold" accessibilityRole="header">
          {t('auth.verifyOtp.title')}
        </AppText>
        <AppText
          variant="caption"
          weight="light"
          color={colors.textSecondary}
          style={styles.instructions}
        >
          {t('auth.verifyOtp.instructions', { destination: challenge.maskedDestination })}
        </AppText>
      </View>

      <View style={styles.otp}>
        <OTPInput
          label={t('auth.verifyOtp.codeLabel')}
          value={code}
          onChange={setCode}
          onComplete={verify}
          length={OTP_LENGTH}
          editable={!verifyOtp.isPending}
          autoFocus
          error={message}
          testID="verify-otp-code"
        />
        <View style={styles.resendRow}>
          <AppText variant="footnote" color={colors.neutral600}>
            {t('auth.verifyOtp.notReceived')}
          </AppText>
          {secondsToResend > 0 && (
            <AppText variant="footnote" weight="semibold" accessibilityLiveRegion="none">
              {formatCountdown(secondsToResend)}
            </AppText>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: resendLocked, busy: resendOtp.isPending }}
            disabled={resendLocked}
            onPress={resend}
            hitSlop={spacing.m}
          >
            <AppText
              variant="footnote"
              weight="semibold"
              color={resendLocked ? colors.neutral500 : colors.primary}
            >
              {t('auth.verifyOtp.resend')}
            </AppText>
          </Pressable>
        </View>
        {resendOtp.isSuccess && !error && (
          <AppText variant="caption" color={colors.success} accessibilityLiveRegion="polite">
            {t('auth.verifyOtp.resent')}
          </AppText>
        )}
      </View>

      <View style={styles.footer}>
        <Checkbox
          label={t('auth.verifyOtp.rememberMe')}
          checked={rememberMe}
          onChange={setRememberMe}
          disabled={verifyOtp.isPending}
        />
        {verifyOtp.isPending && (
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        )}
        {canRetry && !verifyOtp.isPending && (
          <Button
            label={t('auth.verifyOtp.retry')}
            onPress={() => verify(code)}
            style={styles.retry}
          />
        )}
      </View>
    </AuthSheet>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.lg },
  instructions: { textAlign: 'center', lineHeight: 20 },
  otp: { alignItems: 'center', gap: spacing.sm },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET / 2,
  },
  footer: { alignItems: 'center', gap: spacing.l },
  retry: { alignSelf: 'stretch' },
});
