import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { initialsOf } from '@/domain/profile/UserProfile';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useLanguage } from '@/presentation/i18n/useLanguage';
import { LanguageSheet } from '@/presentation/profile/components/LanguageSheet';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useProfile } from '../useProfile';

interface ProfileScreenProps {
  onOpenPersonalInfo?: () => void;
  onOpenDocuments?: () => void;
  /** Abre el catálogo del design system; solo se muestra en el ambiente dev. */
  onOpenCatalog?: () => void;
}

const AVATAR_SIZE = 56;

/**
 * Perfil (COPAYNI-44): nombre, contacto y límite mensual de pay-in, con accesos a la información
 * personal, el idioma y el cierre de sesión. Sin el contexto de diseño (límite de Figma): se armó
 * con el inventario y los componentes existentes. Los accesos no dependen de que cargue el perfil.
 */
export function ProfileScreen({
  onOpenPersonalInfo,
  onOpenDocuments,
  onOpenCatalog,
}: ProfileScreenProps) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const { environment } = useContainer().config;
  const { language, languages } = useLanguage();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const currentLanguage = languages.find(({ code }) => code === language)?.nativeName;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" weight="semibold" accessibilityRole="header">
          {t('tabs.profile')}
        </AppText>
        <ProfileHeader />
        {onOpenPersonalInfo && (
          <ListItem
            title={t('profile.personalInfo.item')}
            icon="person-outline"
            onPress={onOpenPersonalInfo}
            testID="profile-personal-info"
          />
        )}
        {onOpenDocuments && (
          <ListItem
            title={t('documents.list.title')}
            icon="document-text-outline"
            onPress={onOpenDocuments}
            testID="profile-documents"
          />
        )}
        <ListItem
          title={t('profile.language.item')}
          description={currentLanguage}
          icon="language-outline"
          onPress={() => setLanguageSheetOpen(true)}
          testID="profile-language"
        />
        {environment === 'dev' && onOpenCatalog && (
          <ListItem
            title={t('profile.devCatalog')}
            icon="color-palette-outline"
            onPress={onOpenCatalog}
          />
        )}
      </ScrollView>
      <Button variant="secondary" label={t('profile.logout')} onPress={signOut} />
      <LanguageSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </Screen>
  );
}

function ProfileHeader() {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const profile = useProfile();

  if (profile.isPending) {
    return <ActivityIndicator accessibilityLabel={t('common.loading')} />;
  }
  if (profile.isError && !profile.data) {
    return (
      <View style={styles.error} testID="profile-error">
        <AppText accessibilityRole="alert">{errorMessage(t, profile.error)}</AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => void profile.refetch()}
        />
      </View>
    );
  }

  const me = profile.data;
  return (
    <>
      <View style={styles.header} testID="profile-header">
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
          <AppText weight="semibold" color={colors.onPrimary}>
            {initialsOf(me)}
          </AppText>
        </View>
        <View style={styles.headerText}>
          <AppText variant="highlight" weight="semibold">
            {me.fullName ?? t('profile.noName')}
          </AppText>
          <AppText variant="caption" color={colors.neutral500}>
            {me.email ?? me.phone ?? ''}
          </AppText>
        </View>
      </View>
      <Card testID="profile-limit">
        <AppText variant="caption" color={colors.neutral500}>
          {t('profile.limit.title')}
        </AppText>
        <AppText variant="title" weight="semibold">
          {me.monthlyPayInLimit ? formatMoney(me.monthlyPayInLimit) : t('profile.limit.none')}
        </AppText>
        <AppText variant="caption">{t('profile.limit.description')}</AppText>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.m },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: spacing.xxs },
  error: { gap: spacing.m },
});
