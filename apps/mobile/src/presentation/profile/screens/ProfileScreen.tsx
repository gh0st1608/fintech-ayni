import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useLanguage } from '@/presentation/i18n/useLanguage';
import { LanguageSheet } from '@/presentation/profile/components/LanguageSheet';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { useProfile } from '../useProfile';

interface ProfileScreenProps {
  onOpenPersonalInfo?: () => void;
  onOpenDocuments?: () => void;
  onOpenReferral?: () => void;
  /** Abre el catálogo del design system; solo se muestra en el ambiente dev. */
  onOpenCatalog?: () => void;
}

const AVATAR_SIZE = 56;

/**
 * Perfil (Figma 55:10201, COPAYNI-44): nombre, contacto y límite mensual de pay-in, con los
 * accesos de Account y Settings y el cierre de sesión. Los accesos no dependen de que cargue el
 * perfil.
 */
export function ProfileScreen({
  onOpenPersonalInfo,
  onOpenDocuments,
  onOpenReferral,
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
        <ProfileHeader onOpenLimit={onOpenDocuments} />
        <Section title={t('profile.sections.account')}>
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
          {onOpenReferral && (
            <ListItem
              title={t('profile.inviteFriends')}
              icon="person-add-outline"
              onPress={onOpenReferral}
              testID="profile-referral"
            />
          )}
        </Section>
        {/* Security (passcode y biometría) y Support (Get Help) del Figma no tienen historia todavía. */}
        <Section title={t('profile.sections.settings')}>
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
        </Section>
        <Pressable
          accessibilityRole="button"
          onPress={signOut}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.primary} />
          <AppText variant="highlight" weight="semibold" color={colors.primary}>
            {t('profile.logout')}
          </AppText>
        </Pressable>
      </ScrollView>
      <LanguageSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function ProfileHeader({ onOpenLimit }: { onOpenLimit?: () => void }) {
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
  const limit = me.monthlyPayInLimit
    ? formatMoney(me.monthlyPayInLimit, { trimZeroDecimals: true })
    : t('profile.limit.none');
  return (
    <>
      <View style={styles.header} testID="profile-header">
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="person-outline" size={24} color={colors.neutral500} />
        </View>
        <View style={styles.headerText}>
          <AppText variant="highlight" weight="semibold">
            {me.fullName ?? t('profile.noName')}
          </AppText>
          <AppText variant="caption">{me.phone ?? me.email ?? ''}</AppText>
        </View>
      </View>
      {/* Figma 55:10201: tarjeta azul; el límite sube con el comprobante de ingresos. */}
      <Pressable
        accessibilityRole={onOpenLimit ? 'button' : undefined}
        accessibilityLabel={`${t('profile.limit.title')}: ${limit}`}
        accessibilityHint={onOpenLimit ? t('profile.limit.hint') : undefined}
        disabled={!onOpenLimit}
        onPress={onOpenLimit}
        style={({ pressed }) => [styles.limit, pressed && styles.pressed]}
        testID="profile-limit"
      >
        <View style={styles.limitText}>
          <AppText variant="caption" color={colors.onPrimary}>
            {t('profile.limit.title')}
          </AppText>
          <AppText variant="highlight" weight="semibold" color={colors.onPrimary}>
            {limit}
          </AppText>
        </View>
        {onOpenLimit && <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />}
      </Pressable>
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
    borderWidth: 1,
    borderColor: colors.secondary100,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: spacing.xxs },
  limit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.lg,
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  limitText: { flex: 1, gap: spacing.xxs },
  section: { gap: spacing.sm },
  logout: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pressed: { opacity: 0.85 },
  error: { gap: spacing.m },
});
