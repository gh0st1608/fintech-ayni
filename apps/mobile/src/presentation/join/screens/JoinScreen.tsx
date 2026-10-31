import { useTranslation } from 'react-i18next';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

import GAMEYA from '@assets/images/join/gameya.png';
import SAVING from '@assets/images/join/saving.png';

import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { AppText } from '@/presentation/shared/components/AppText';
import { Card } from '@/presentation/shared/components/Card';
import { Chevron } from '@/presentation/shared/components/Chevron';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useJoinConfig } from '../hooks/useJoinConfig';
import { useJoinFlow } from '../JoinFlowProvider';

interface JoinScreenProps {
  /** La ruta decide a qué pantalla lleva cada opción. */
  onJoinGameya: () => void;
  onJoinSavingProgram: () => void;
}

/**
 * "Choose a Service" (Figma 55:9069): unirse a un Game'ya o a un programa de ahorro, cada uno
 * con su ilustración.
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
        <ServiceCard
          image={GAMEYA}
          title={t('join.gameya.title')}
          description={gameyaDescription}
          onPress={() => {
            start();
            onJoinGameya();
          }}
          testID="join-gameya"
        />
        <ServiceCard
          image={SAVING}
          title={t('join.saving.title')}
          description={savingDescription}
          onPress={onJoinSavingProgram}
          testID="join-saving"
        />
      </View>
    </Screen>
  );
}

interface ServiceCardProps {
  image: ImageSourcePropType;
  title: string;
  description: string;
  onPress: () => void;
  testID: string;
}

function ServiceCard({ image, title, description, onPress, testID }: ServiceCardProps) {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}. ${description}`}
      style={styles.card}
      testID={testID}
    >
      <View style={styles.cardText}>
        <Image
          source={image}
          style={styles.image}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <AppText variant="highlight">{title}</AppText>
        <AppText variant="caption" color={colors.neutral500}>
          {description}
        </AppText>
      </View>
      <Chevron />
    </Card>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.m, marginTop: spacing.l },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  cardText: { flex: 1, gap: spacing.xs },
  image: { width: 44, height: 39, marginBottom: spacing.xxs },
});
