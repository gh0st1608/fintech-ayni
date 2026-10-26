import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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

/** Perfil: el contenido completo se implementa en COPAYNI-44; aquí solo el cierre de sesión. */
export function ProfileScreen({ onOpenCatalog }: ProfileScreenProps) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const { environment } = useContainer().config;

  return (
    <Screen>
      <AppText variant="title" weight="semibold" accessibilityRole="header">
        {t('tabs.profile')}
      </AppText>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, justifyContent: 'flex-end' },
});
