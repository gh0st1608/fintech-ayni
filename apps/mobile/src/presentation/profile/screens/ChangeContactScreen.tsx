import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { InvalidLoginIdentifierError } from '@/domain/auth/value-objects/LoginIdentifier';
import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { OTPInput } from '@/presentation/shared/components/OTPInput';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useStartContactChange, useVerifyContactChange } from '../useProfile';

interface ChangeContactScreenProps {
  type: 'email' | 'phone';
  onChanged: () => void;
}

/**
 * Cambiar el email o el teléfono (COPAYNI-45, supuesto R9): un código al dato nuevo confirma que
 * es del usuario. El teléfono va en formato internacional, como en el login (D14).
 */
export function ChangeContactScreen({ type, onChanged }: ChangeContactScreenProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const start = useStartContactChange();
  const verify = useVerifyContactChange();

  const startError = (error: unknown): string =>
    error instanceof InvalidLoginIdentifierError
      ? t(`profile.contact.invalid.${type}`)
      : error instanceof AppError && error.code === 'VALIDATION_ERROR'
        ? t('profile.contact.same')
        : errorMessage(t, error);

  const verifyError = (error: unknown): string => {
    if (error instanceof OtpVerificationError) return t(`profile.contact.otp.${error.reason}`);
    if (error instanceof AppError && error.code === 'CONTACT_TAKEN') {
      return t('profile.contact.taken');
    }
    return errorMessage(t, error);
  };

  const submitCode = (entered: string) => {
    if (!challenge || verify.isPending) return;
    verify.mutate({ challengeId: challenge.challengeId, code: entered }, { onSuccess: onChanged });
  };

  if (!challenge) {
    return (
      <Screen edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label={t(`profile.contact.new.${type}`)}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              start.reset();
            }}
            keyboardType={type === 'email' ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoComplete={type === 'email' ? 'email' : 'tel'}
            placeholder={type === 'phone' ? t('profile.contact.phonePlaceholder') : undefined}
            error={start.isError ? startError(start.error) : undefined}
            testID="contact-value"
          />
          <AppText variant="caption" color={colors.neutral500}>
            {t('profile.contact.explain')}
          </AppText>
        </ScrollView>
        <Button
          label={t('profile.contact.sendCode')}
          disabled={value.trim().length === 0}
          loading={start.isPending}
          onPress={() => start.mutate(value, { onSuccess: setChallenge })}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText>
          {t('profile.contact.codeSent', { destination: challenge.maskedDestination })}
        </AppText>
        <OTPInput
          label={t('profile.contact.codeLabel')}
          value={code}
          onChange={(next) => {
            setCode(next);
            verify.reset();
          }}
          onComplete={submitCode}
          error={verify.isError ? verifyError(verify.error) : undefined}
          autoFocus
          testID="contact-otp"
        />
      </ScrollView>
      <Button
        label={t('profile.contact.verify')}
        disabled={code.length < 4}
        loading={verify.isPending}
        onPress={() => submitCode(code)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
