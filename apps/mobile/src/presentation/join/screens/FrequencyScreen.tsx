import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type CadenceOption, offersCadenceChoice } from '@/domain/circles/JoinConfig';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Chevron } from '@/presentation/shared/components/Chevron';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { useJoinConfig } from '../hooks/useJoinConfig';
import { useJoinFlow } from '../JoinFlowProvider';

interface FrequencyScreenProps {
  /** Se llama con la frecuencia ya guardada en el borrador; la ruta navega al monto. */
  onNext: () => void;
}

/**
 * Elegir la frecuencia antes de empezar (COPAYNI-116): cada cuánto paga la persona su junta.
 *
 * No va numerada en el stepper: es una elección previa al flujo de cuatro pasos, como la del
 * servicio. Solo se ofrecen las frecuencias que el servidor habilita (COPAYNI-121) y que esta app
 * declara soportar (COPAYNI-115), y **con una sola se sigue de largo**: el flujo es entonces el
 * mensual de siempre, que es lo que ve la app publicada. Elegir otra frecuencia descarta el monto
 * y los turnos, porque las combinaciones ofrecibles y las fechas se recalculan.
 */
export function FrequencyScreen({ onNext }: FrequencyScreenProps) {
  const { t } = useTranslation();
  const config = useJoinConfig();
  const single = config.data !== undefined && !offersCadenceChoice(config.data);

  useEffect(() => {
    if (single) onNext();
  }, [single, onNext]);

  let body: React.ReactNode;
  if (config.isPending || single) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (config.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, config.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => config.refetch()} />
      </View>
    );
  } else {
    body = <CadencePicker cadences={config.data.cadences} onNext={onNext} />;
  }

  return <Screen edges={['bottom']}>{body}</Screen>;
}

function CadencePicker({
  cadences,
  onNext,
}: {
  cadences: readonly CadenceOption[];
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const { draft, setCadence } = useJoinFlow();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {t('join.frequency.question')}
      </AppText>
      <View style={styles.options} accessibilityLabel={t('join.frequency.optionsLabel')}>
        {cadences.map((cadence) => {
          const name = t(`circles.cadences.${cadence.id}.turn`);
          const every = t('join.frequency.turnEvery', { days: cadence.turnDays });
          const selected = draft.cadence === cadence.id;
          return (
            <Pressable
              key={cadence.id}
              accessibilityRole="button"
              accessibilityLabel={`${name}. ${every}`}
              accessibilityState={{ selected }}
              onPress={() => {
                setCadence(cadence.id);
                onNext();
              }}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
              testID={`cadence-option-${cadence.id}`}
            >
              <View style={styles.optionText}>
                <AppText weight="semibold">{name}</AppText>
                <AppText variant="footnote" color={colors.neutral600}>
                  {every}
                </AppText>
              </View>
              <Chevron />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  options: { gap: spacing.sm },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.m,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary300,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary100 },
  optionText: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.7 },
});
