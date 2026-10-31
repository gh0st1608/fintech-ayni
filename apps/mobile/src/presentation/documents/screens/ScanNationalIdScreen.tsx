import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import SCAN_DONT from '@assets/images/documents/scan-dont.png';
import ROCKET from '@assets/images/shared/rocket.png';
import type { LocalFile } from '@/domain/documents/LocalFile';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { DocumentResult } from '../components/DocumentResult';
import { FileSlot } from '../components/FileSlot';
import { ScanGuideIcon } from '../components/ScanGuideIcon';
import { documentErrorMessage } from '../documentErrorMessage';
import { useSubmitNationalId } from '../useDocuments';
import { useFileCapture } from '../useFileCapture';

/**
 * Scan National ID (Figma 55:10598, COPAYNI-47): primero la guía con los ejemplos de qué evitar;
 * luego la foto del anverso y del reverso, la subida directa al almacenamiento y la verificación.
 * El Figma no diseña la captura: se usan los espacios de foto del design system.
 */
export function ScanNationalIdScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'guide' | 'capture'>('guide');
  const [front, setFront] = useState<LocalFile | null>(null);
  const [back, setBack] = useState<LocalFile | null>(null);
  const { capture, error: captureError } = useFileCapture();
  const submit = useSubmitNationalId();

  if (submit.data) {
    return (
      <Screen edges={['bottom']}>
        <DocumentResult
          document={submit.data}
          onDone={onDone}
          onRetry={() => {
            setFront(null);
            setBack(null);
            submit.reset();
          }}
        />
      </Screen>
    );
  }

  if (step === 'guide') {
    return (
      <Screen edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScanGuideIcon />
          <AppText variant="highlight" weight="semibold">
            {t('documents.nationalId.guide')}
          </AppText>
          <View style={styles.examples}>
            <DontExample label={t('documents.nationalId.dontBlurry')} blurred />
            <DontExample label={t('documents.nationalId.dontCovered')} />
          </View>
          <InfoBanner message={t('documents.nationalId.why')} illustration={ROCKET} />
        </ScrollView>
        <Button label={t('documents.nationalId.scan')} onPress={() => setStep('capture')} />
      </Screen>
    );
  }

  const set = (setter: (file: LocalFile) => void) => (file: LocalFile | null) => {
    if (file) setter(file);
  };
  const error = captureError ?? submit.error;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color={colors.neutral500}>{t('documents.nationalId.intro')}</AppText>
        <FileSlot
          title={t('documents.nationalId.front')}
          file={front}
          onTakePhoto={() => void capture('photo').then(set(setFront))}
          onPickImage={() => void capture('image').then(set(setFront))}
          testID="slot-front"
        />
        <FileSlot
          title={t('documents.nationalId.back')}
          file={back}
          onTakePhoto={() => void capture('photo').then(set(setBack))}
          onPickImage={() => void capture('image').then(set(setBack))}
          testID="slot-back"
        />
        {error !== null && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {documentErrorMessage(t, error)}
          </AppText>
        )}
      </ScrollView>
      <Button
        label={t('documents.nationalId.submit')}
        disabled={!front || !back}
        loading={submit.isPending}
        onPress={() => {
          if (front && back && !submit.isPending) submit.mutate({ front, back });
        }}
      />
    </Screen>
  );
}

/** Ejemplo "Don't" del Figma: la mano sosteniendo el documento, girada dentro de un marco rojo. */
function DontExample({ label, blurred = false }: { label: string; blurred?: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.example}
      accessible
      accessibilityLabel={`${t('documents.nationalId.dont')}: ${label}`}
    >
      <View style={styles.exampleFrame}>
        <Image
          source={SCAN_DONT}
          style={styles.exampleImage}
          blurRadius={blurred ? 2 : 0}
          resizeMode="cover"
        />
      </View>
      <View style={styles.dontBadge}>
        <AppText variant="caption" color={colors.onPrimary} style={styles.dontText}>
          {t('documents.nationalId.dont')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
  examples: { flexDirection: 'row', gap: spacing.sm },
  example: { flex: 1, paddingTop: spacing.sm },
  exampleFrame: {
    height: 100,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  // Igual que el Figma: la imagen girada 55° y desplazada dentro del marco.
  exampleImage: {
    position: 'absolute',
    left: 10,
    top: -20,
    width: 100,
    height: 131,
    transform: [{ rotate: '55deg' }],
  },
  dontBadge: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },
  dontText: { fontSize: 10, lineHeight: 14 },
});
