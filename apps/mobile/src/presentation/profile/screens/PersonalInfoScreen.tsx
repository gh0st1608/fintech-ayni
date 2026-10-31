import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { InvalidPersonNameError } from '@/application/profile/usecases/profileUseCases';
import type { UserProfile } from '@/domain/profile/UserProfile';
import { PERSON_NAME_MAX_LENGTH } from '@/domain/profile/UserProfile';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { BUTTON_HEIGHT, colors, radius, spacing } from '@/presentation/theme/tokens';

import { useProfile, useUpdatePersonalInfo } from '../useProfile';

interface PersonalInfoScreenProps {
  onChangeContact: (type: 'email' | 'phone') => void;
}

/**
 * Información personal (COPAYNI-45): nombre y apellido editables; el email y el teléfono se
 * cambian verificando un código enviado al dato nuevo (R9).
 */
export function PersonalInfoScreen({ onChangeContact }: PersonalInfoScreenProps) {
  const { t } = useTranslation();
  const profile = useProfile();

  return (
    <Screen edges={['bottom']}>
      {profile.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : profile.isError && !profile.data ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, profile.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void profile.refetch()}
          />
        </View>
      ) : (
        <PersonalInfoForm profile={profile.data} onChangeContact={onChangeContact} />
      )}
    </Screen>
  );
}

function PersonalInfoForm({
  profile,
  onChangeContact,
}: { profile: UserProfile } & PersonalInfoScreenProps) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(profile.firstName ?? '');
  const [lastName, setLastName] = useState(profile.lastName ?? '');
  const update = useUpdatePersonalInfo();
  const invalid = update.error instanceof InvalidPersonNameError ? update.error.fields : [];
  const changed =
    firstName.trim() !== (profile.firstName ?? '') || lastName.trim() !== (profile.lastName ?? '');

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('profile.personalInfo.firstName')}
          value={firstName}
          onChangeText={(value) => {
            setFirstName(value);
            update.reset();
          }}
          autoComplete="given-name"
          maxLength={PERSON_NAME_MAX_LENGTH}
          error={invalid.includes('firstName') ? t('profile.personalInfo.invalidName') : undefined}
          testID="first-name"
        />
        <TextField
          label={t('profile.personalInfo.lastName')}
          value={lastName}
          onChangeText={(value) => {
            setLastName(value);
            update.reset();
          }}
          autoComplete="family-name"
          maxLength={PERSON_NAME_MAX_LENGTH}
          error={invalid.includes('lastName') ? t('profile.personalInfo.invalidName') : undefined}
          testID="last-name"
        />
        {update.isSuccess && !changed && (
          <AppText accessibilityRole="alert" color={colors.success}>
            {t('profile.personalInfo.saved')}
          </AppText>
        )}
        {update.isError && invalid.length === 0 && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {errorMessage(t, update.error)}
          </AppText>
        )}
        {/* Figma 55:10379: teléfono y email como campos; se cambian aparte con un código (R9). */}
        <ContactField
          label={t('profile.personalInfo.phone')}
          value={profile.phone ?? t('profile.personalInfo.notSet')}
          onPress={() => onChangeContact('phone')}
          testID="contact-phone"
        />
        <ContactField
          label={t('profile.personalInfo.email')}
          value={profile.email ?? t('profile.personalInfo.notSet')}
          onPress={() => onChangeContact('email')}
          testID="contact-email"
        />
      </ScrollView>
      <Button
        label={t('profile.personalInfo.save')}
        disabled={!changed}
        loading={update.isPending}
        onPress={() => update.mutate({ firstName, lastName })}
      />
    </>
  );
}

interface ContactFieldProps {
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
}

/** Se ve como un campo de texto, pero abre el cambio verificado del dato. */
function ContactField({ label, value, onPress, testID }: ContactFieldProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <AppText weight="semibold" importantForAccessibility="no">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value}`}
        accessibilityHint={t('profile.personalInfo.change')}
        onPress={onPress}
        style={({ pressed }) => [styles.box, pressed && styles.pressed]}
        testID={testID}
      >
        <AppText style={styles.value}>{value}</AppText>
        <AppText color={colors.primary}>{t('profile.personalInfo.change')}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  field: { gap: spacing.sm },
  box: {
    minHeight: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderNormal,
  },
  value: { flex: 1 },
  pressed: { opacity: 0.85 },
});
