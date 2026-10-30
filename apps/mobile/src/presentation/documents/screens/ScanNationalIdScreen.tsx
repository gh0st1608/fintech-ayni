import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import type { LocalFile } from '@/domain/documents/LocalFile';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { DocumentResult } from '../components/DocumentResult';
import { FileSlot } from '../components/FileSlot';
import { documentErrorMessage } from '../documentErrorMessage';
import { useSubmitNationalId } from '../useDocuments';
import { useFileCapture } from '../useFileCapture';

/**
 * Scan National ID (COPAYNI-47): foto del anverso y del reverso, subida directa al
 * almacenamiento y verificación. Sin el contexto de diseño (límite de Figma).
 */
export function ScanNationalIdScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
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

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
