import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { AppText } from '@/presentation/shared/components/AppText';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { spacing } from '@/presentation/theme/tokens';

import { useJoinConfig } from '../hooks/useJoinConfig';
import { useJoinFlow } from '../JoinFlowProvider';

interface JoinScreenProps {
  /** La ruta decide a qué pantalla lleva cada opción. */
  onJoinGameya: () => void;
  onJoinSavingProgram: () => void;
}

/**
 * "Choose a Service" (Figma 55:9069): unirse a un Game'ya o a un programa de ahorro.
 * Los montos máximos llegan del backend; mientras no cargan, la descripción va sin monto.
 */
export function JoinScreen({ onJoinGameya, onJoinSavingProgram }: JoinScreenProps) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { data: config } = useJoinConfig();
  const { start } = useJoinFlow();

  const gameyaDescription = config
    ? t('join.gameya.descriptionWithMax', {
        amount: formatMoney(config.payoutRange.max, { trimZeroDecimals: true }),
      })
    : t('join.gameya.description');
  const savingDescription = config
    ? t('join.saving.descriptionWithMax', {
        amount: formatMoney(config.savingProgramMax, { trimZeroDecimals: true }),
      })
    : t('join.saving.description');

  return (
    <Screen edges={[]}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {t('join.question')}
      </AppText>
      <View style={styles.options}>
        <ListItem
          icon="people-outline"
          title={t('join.gameya.title')}
          description={gameyaDescription}
          onPress={() => {
            start();
            onJoinGameya();
          }}
          testID="join-gameya"
        />
        <ListItem
          icon="wallet-outline"
          title={t('join.saving.title')}
          description={savingDescription}
          onPress={onJoinSavingProgram}
          testID="join-saving"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm, marginTop: spacing.l },
});
