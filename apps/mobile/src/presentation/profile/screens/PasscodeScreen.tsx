import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { PASSCODE_LENGTH } from '@/domain/auth/value-objects/Passcode';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { passcodeErrorMessage } from '../passcodeError';
import { useChangePasscode, usePasscodeStatus } from '../usePasscode';

interface PasscodeScreenProps {
  onDone: () => void;
}

/** Crear o cambiar el passcode (COPAYNI-23). Sin diseño en el Figma (pending-scope D9). */
export function PasscodeScreen({ onDone }: PasscodeScreenProps) {
  const { t } = useTranslation();
  const status = usePasscodeStatus();
  const change = useChangePasscode();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');

  if (status.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </Screen>
    );
  }
  if (status.isError) {
    return (
      <Screen edges={['bottom']} style={styles.content}>
        <AppText accessibilityRole="alert">{errorMessage(t, status.error)}</AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => void status.refetch()}
        />
      </Screen>
    );
  }

  const configured = status.data;
  const field = {
    keyboardType: 'number-pad',
    secureTextEntry: true,
    maxLength: PASSCODE_LENGTH,
    autoComplete: 'off',
    autoCorrect: false,
    contextMenuHidden: true,
  } as const;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText color={colors.neutral500}>{t('profile.passcode.hint')}</AppText>
        {configured && (
          <TextField
            {...field}
            label={t('profile.passcode.current')}
            value={current}
            onChangeText={setCurrent}
            testID="passcode-current"
          />
        )}
        <TextField
          {...field}
          label={t('profile.passcode.new')}
          value={next}
          onChangeText={setNext}
          testID="passcode-new"
        />
        <TextField
          {...field}
          label={t('profile.passcode.confirm')}
          value={confirmation}
          onChangeText={setConfirmation}
          testID="passcode-confirm"
        />
        {change.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {passcodeErrorMessage(t, change.error)}
          </AppText>
        )}
        <Button
          label={t('profile.passcode.save')}
          loading={change.isPending}
          onPress={() =>
            change.mutate(
              { current: configured ? current : undefined, next, confirmation },
              { onSuccess: onDone },
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.m, paddingVertical: spacing.m },
});
