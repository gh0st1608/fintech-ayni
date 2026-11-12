import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  ConsentRequiredError,
  type IdentityVerification,
  InvalidDniError,
} from '@/domain/documents/IdentityVerification';
import { AppError } from '@/domain/shared/errors/AppError';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { Checkbox } from '@/presentation/shared/components/Checkbox';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

/** Pasos que se explican antes de empezar (claves de identity.steps). */
const STEPS = ['dni', 'selfie', 'result'] as const;

export const identityVerificationQueryKey = ['documents', 'identity-verification'] as const;

/** El estado de la verificación en línea (GET /me/identity-verification). */
export function useIdentityVerification() {
  const { documents } = useContainer();
  return useQuery({
    queryKey: identityVerificationQueryKey,
    queryFn: ({ signal }) => documents.getIdentityVerification.execute(signal),
  });
}

/**
 * Verificar la identidad con VerificaID (COPAYNI-92): consentimiento y DNI, el flujo del proveedor
 * en el navegador del sistema (selfie y prueba de vida) y el resultado al volver. Sin diseño en
 * Figma: usa los componentes del design system y el patrón de Documentos.
 */
export function IdentityVerificationScreen({
  onManualUpload,
  onCompleteProfile,
  onDone,
}: {
  /** Tras agotar los intentos: subir el DNI para revisión manual. */
  onManualUpload: () => void;
  /** El perfil no tiene nombre y apellido: los pide Datos personales. */
  onCompleteProfile: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { documents } = useContainer();
  const queryClient = useQueryClient();
  const verification = useIdentityVerification();
  const [dni, setDni] = useState('');
  const [consent, setConsent] = useState(false);
  const save = (result: IdentityVerification) => {
    queryClient.setQueryData(identityVerificationQueryKey, result);
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };
  const start = useMutation({
    mutationFn: (consentVersion: string) =>
      documents.startIdentityVerification.execute({
        documentNumber: dni,
        consentAccepted: consent,
        consentVersion,
      }),
    onSuccess: save,
  });
  const resume = useMutation({
    mutationFn: (current: IdentityVerification) =>
      documents.resumeIdentityVerification.execute(current),
    onSuccess: save,
  });

  if (verification.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (verification.isError) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, verification.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void verification.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const current = verification.data;
  const code = start.error instanceof AppError ? start.error.code : undefined;
  const tooManyAttempts = code === 'IDENTITY_ATTEMPTS_EXCEEDED';

  if (current.status === 'approved') {
    return (
      <Status
        icon="shield-checkmark"
        tint={colors.success}
        title={t('identity.approvedTitle')}
        body={t('identity.approvedBody', { document: current.documentNumber ?? '' })}
        action={<Button label={t('identity.done')} onPress={onDone} />}
      />
    );
  }
  if (current.status === 'inReview') {
    return (
      <Status
        icon="time-outline"
        tint={colors.primary}
        title={t('identity.reviewTitle')}
        body={t('identity.reviewBody')}
        action={
          <Button
            label={t('identity.refresh')}
            variant="secondary"
            onPress={() => void verification.refetch()}
          />
        }
      />
    );
  }
  if (current.status === 'inProgress') {
    return (
      <Status
        icon="scan-outline"
        tint={colors.primary}
        title={t('identity.progressTitle')}
        body={t('identity.progressBody')}
        action={
          <View style={styles.actions}>
            {resume.isError && (
              <AppText accessibilityRole="alert" color={colors.error}>
                {errorMessage(t, resume.error)}
              </AppText>
            )}
            <Button
              label={t('identity.resume')}
              loading={resume.isPending}
              onPress={() => resume.mutate(current)}
              testID="identity-resume"
            />
            <Button
              label={t('identity.refresh')}
              variant="secondary"
              onPress={() => void verification.refetch()}
            />
          </View>
        }
      />
    );
  }

  const fieldError =
    start.error instanceof InvalidDniError ||
    (start.error instanceof AppError && start.error.fieldErrors?.documentNumber)
      ? t('identity.invalidDni')
      : undefined;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {current.status === 'rejected' && current.reason && (
          <Card style={styles.rejected} testID="identity-rejected">
            <AppText weight="semibold" color={colors.error}>
              {t('identity.rejectedTitle')}
            </AppText>
            <AppText>{t(`identity.reasons.${current.reason}`)}</AppText>
          </Card>
        )}
        <AppText variant="title" weight="semibold">
          {t('identity.title')}
        </AppText>
        <AppText color={colors.textSecondary}>{t('identity.intro')}</AppText>
        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <AppText key={step} color={colors.textSecondary}>
              {`${String(index + 1)}. ${t(`identity.steps.${step}`)}`}
            </AppText>
          ))}
        </View>
        <TextField
          label={t('identity.dniLabel')}
          value={dni}
          onChangeText={(value) => setDni(value.replace(/\D/g, '').slice(0, 8))}
          keyboardType="number-pad"
          maxLength={8}
          error={fieldError}
          testID="identity-dni"
        />
        <Checkbox
          label={t('identity.consent')}
          checked={consent}
          onChange={setConsent}
          testID="identity-consent"
        />
        <AppText variant="caption" color={colors.neutral600}>
          {t('identity.privacy')}
        </AppText>
        {start.isError && !fieldError && (
          <AppText accessibilityRole="alert" color={colors.error} testID="identity-error">
            {start.error instanceof ConsentRequiredError
              ? t('identity.consentRequired')
              : code === 'IDENTITY_PROFILE_INCOMPLETE'
                ? t('identity.profileIncomplete')
                : tooManyAttempts
                  ? t('identity.tooManyAttempts')
                  : errorMessage(t, start.error)}
          </AppText>
        )}
        {tooManyAttempts ? (
          <Button label={t('identity.manualUpload')} onPress={onManualUpload} />
        ) : code === 'IDENTITY_PROFILE_INCOMPLETE' ? (
          <Button label={t('identity.completeProfile')} onPress={onCompleteProfile} />
        ) : (
          <Button
            label={t('identity.start')}
            loading={start.isPending}
            onPress={() => start.mutate(current.consentVersion)}
            testID="identity-start"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function Status({
  icon,
  tint,
  title,
  body,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Screen edges={['bottom']}>
      <View style={[styles.center, styles.content]} testID="identity-status">
        <Ionicons name={icon} size={56} color={tint} />
        <AppText variant="title" weight="semibold" style={styles.centerText}>
          {title}
        </AppText>
        <AppText color={colors.textSecondary} style={styles.centerText}>
          {body}
        </AppText>
        {action}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  steps: { gap: spacing.xs },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
  rejected: { gap: spacing.xs, borderColor: colors.error },
});
