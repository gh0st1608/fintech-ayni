import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/presentation/i18n/useLanguage';
import { LanguageSheet } from '@/presentation/profile/components/LanguageSheet';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';

interface ProfileScreenProps {
  /** Abre el catálogo del design system; solo se muestra en el ambiente dev. */
  onOpenCatalog?: () => void;
}

/** Perfil: el contenido completo se implementa en COPAYNI-44; aquí, idioma y cierre de sesión. */
export function ProfileScreen({ onOpenCatalog }: ProfileScreenProps) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const { environment } = useContainer().config;
  const { language, languages } = useLanguage();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const currentLanguage = languages.find(({ code }) => code === language)?.nativeName;

  return (
    <Screen>
      <AppText variant="title" weight="semibold" accessibilityRole="header">
        {t('tabs.profile')}
      </AppText>
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
      <View style={styles.footer}>
        <Button variant="secondary" label={t('profile.logout')} onPress={signOut} />
      </View>
      <LanguageSheet visible={languageSheetOpen} onClose={() => setLanguageSheetOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, justifyContent: 'flex-end' },
});
