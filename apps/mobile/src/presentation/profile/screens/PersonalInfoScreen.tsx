import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { InvalidPersonNameError } from '@/application/profile/usecases/profileUseCases';
import type { UserProfile } from '@/domain/profile/UserProfile';
import { PERSON_NAME_MAX_LENGTH } from '@/domain/profile/UserProfile';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

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
        <ListItem
          title={t('profile.personalInfo.email')}
          description={profile.email ?? t('profile.personalInfo.notSet')}
          icon="mail-outline"
          trailing={<AppText color={colors.primary}>{t('profile.personalInfo.change')}</AppText>}
          onPress={() => onChangeContact('email')}
          testID="contact-email"
        />
        <ListItem
          title={t('profile.personalInfo.phone')}
          description={profile.phone ?? t('profile.personalInfo.notSet')}
          icon="call-outline"
          trailing={<AppText color={colors.primary}>{t('profile.personalInfo.change')}</AppText>}
          onPress={() => onChangeContact('phone')}
          testID="contact-phone"
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
