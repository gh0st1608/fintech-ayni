import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AGREEMENT_DOCUMENTS,
  canRequestSignatureCode,
  type AgreementDocument,
  type MembershipAgreement,
  type SignatureChallenge,
} from '@/domain/agreements/MembershipAgreement';
import { SignatureRejectedError } from '@/domain/agreements/errors/SignatureErrors';
import { OTP_LENGTH } from '@/domain/auth/value-objects/OtpCode';
import { AgreementDocumentCard } from '@/presentation/agreements/components/AgreementDocumentCard';
import {
  useAgreement,
  useRequestSignatureCode,
  useSignAgreement,
} from '@/presentation/agreements/useAgreements';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { OTPInput } from '@/presentation/shared/components/OTPInput';
import { Screen } from '@/presentation/shared/components/Screen';
import { formatCountdown, useCountdown } from '@/presentation/shared/hooks/useCountdown';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

interface SignAgreementsScreenProps {
  agreementId: string;
  /** Abre un documento para leerlo, lo que lo marca leído. */
  onOpenDocument: (document: AgreementDocument) => void;
  /** Tras firmar, o si el acuerdo ya no admite firma. */
  onDone: () => void;
}

function rejectionMessage(t: TFunction, error: SignatureRejectedError): string {
  if (error.reason === 'expired') return t('agreements.sign.codeExpired');
  if (error.reason === 'attempts_exceeded') return t('agreements.sign.attemptsExceeded');
  return error.attemptsRemaining === undefined
    ? t('agreements.sign.codeInvalid')
    : t('agreements.sign.codeInvalidWithAttempts', { count: error.attemptsRemaining });
}

/**
 * D3 · Firma de documentos (Figma 2051:2304, COPAYNI-89): el contrato y el pagaré con su estado
 * de lectura y la firma con un código al celular. Hasta firmar, el turno está **reservado, no
 * firme**: si vence el plazo, se libera y vuelve a ofrecerse.
 */
export function SignAgreementsScreen({
  agreementId,
  onOpenDocument,
  onDone,
}: SignAgreementsScreenProps) {
  const { t } = useTranslation();
  const { agreement, isPending, isError, error, refetch } = useAgreement(agreementId);

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (isError && !agreement) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, error)}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={() => void refetch()} />
        </View>
      </Screen>
    );
  }
  if (!agreement) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState title={t('agreements.sign.notFound')} />
      </Screen>
    );
  }
  if (agreement.status !== 'pending') {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <EmptyState
            title={t(`agreements.sign.${agreement.status}.title`)}
            description={t(`agreements.sign.${agreement.status}.description`)}
          />
          <Button label={t('agreements.sign.done')} onPress={onDone} />
        </View>
      </Screen>
    );
  }
  return <PendingAgreement agreement={agreement} onOpenDocument={onOpenDocument} onDone={onDone} />;
}

function PendingAgreement({
  agreement,
  onOpenDocument,
  onDone,
}: {
  agreement: MembershipAgreement;
  onOpenDocument: (document: AgreementDocument) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const requestCode = useRequestSignatureCode();
  const sign = useSignAgreement();
  const [challenge, setChallenge] = useState<SignatureChallenge | null>(null);
  const [code, setCode] = useState('');
  const readyToSign = canRequestSignatureCode(agreement);

  const requestSignatureCode = () => {
    if (requestCode.isPending) return;
    sign.reset();
    setCode('');
    requestCode.mutate(agreement, { onSuccess: setChallenge });
  };

  const submit = (value: string) => {
    if (sign.isPending) return;
    sign.mutate(
      { agreementId: agreement.id, code: value },
      {
        // Un código rechazado se borra; ante un fallo de red se conserva para reintentar.
        onError: (error) => {
          if (error instanceof SignatureRejectedError) setCode('');
        },
        onSuccess: onDone,
      },
    );
  };

  const error = sign.error ?? requestCode.error;
  const message =
    error instanceof SignatureRejectedError
      ? rejectionMessage(t, error)
      : error
        ? errorMessage(t, error)
        : undefined;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText weight="semibold">{t('agreements.sign.intro')}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>
          {t('agreements.sign.deadline', {
            date: formatDate(agreement.expiresAt, 'dateTime'),
          })}
        </AppText>

        {AGREEMENT_DOCUMENTS.map((document) => (
          <AgreementDocumentCard
            key={document}
            document={document}
            read={!agreement.unread.includes(document)}
            onOpen={() => onOpenDocument(document)}
          />
        ))}

        <Card style={styles.signature} testID="agreement-signature">
          <AppText weight="semibold">{t('agreements.sign.codeTitle')}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {challenge
              ? t('agreements.sign.codeSentTo', { destination: challenge.maskedDestination })
              : t(readyToSign ? 'agreements.sign.codeIntro' : 'agreements.sign.readFirst')}
          </AppText>
          {challenge && (
            <>
              <OTPInput
                label={t('agreements.sign.codeLabel')}
                value={code}
                onChange={setCode}
                onComplete={submit}
                length={OTP_LENGTH}
                editable={!sign.isPending}
                autoFocus
                error={message}
                testID="agreement-code"
              />
              <ResendCode
                resendAt={challenge.resendAvailableAt}
                busy={requestCode.isPending}
                onResend={requestSignatureCode}
              />
            </>
          )}
          {!challenge && message && (
            <AppText variant="caption" color={colors.error} accessibilityRole="alert">
              {message}
            </AppText>
          )}
        </Card>
      </ScrollView>

      {challenge ? (
        <Button
          label={t('agreements.sign.submit')}
          loading={sign.isPending}
          disabled={code.length !== OTP_LENGTH}
          onPress={() => submit(code)}
        />
      ) : (
        <Button
          label={t('agreements.sign.requestCode')}
          loading={requestCode.isPending}
          disabled={!readyToSign}
          onPress={requestSignatureCode}
          testID="agreement-request-code"
        />
      )}
    </Screen>
  );
}

function ResendCode({
  resendAt,
  busy,
  onResend,
}: {
  resendAt: Date;
  busy: boolean;
  onResend: () => void;
}) {
  const { t } = useTranslation();
  const seconds = useCountdown(resendAt);
  const locked = seconds > 0 || busy;

  return (
    <View style={styles.resendRow}>
      <AppText variant="footnote" color={colors.neutral600}>
        {t('agreements.sign.notReceived')}
      </AppText>
      {seconds > 0 && (
        <AppText variant="footnote" weight="semibold">
          {formatCountdown(seconds)}
        </AppText>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, busy }}
        disabled={locked}
        onPress={onResend}
        hitSlop={spacing.m}
      >
        <AppText
          variant="footnote"
          weight="semibold"
          color={locked ? colors.neutral500 : colors.primary}
        >
          {t('agreements.sign.resend')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.m, paddingVertical: spacing.l },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET / 2,
  },
  signature: { gap: spacing.sm },
});
