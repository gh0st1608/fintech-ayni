import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Screen } from './Screen';

/** Pantalla provisional para rutas del shell cuya historia aún no se implementa. */
export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title" weight="semibold" accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.body}>
        <AppText variant="highlight" weight="semibold">
          {t('common.comingSoon')}
        </AppText>
        <AppText color={colors.neutral500}>{t('common.comingSoonDescription')}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
});
