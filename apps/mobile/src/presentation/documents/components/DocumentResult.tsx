import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { KycDocument } from '@/domain/documents/KycDocument';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { colors, spacing } from '@/presentation/theme/tokens';

interface DocumentResultProps {
  document: KycDocument;
  onDone: () => void;
  onRetry: () => void;
}

/** Resultado de la verificación: aprobado, en revisión o rechazado con motivo y reintento. */
export function DocumentResult({ document, onDone, onRetry }: DocumentResultProps) {
  const { t } = useTranslation();
  const rejected = document.status === 'rejected';
  return (
    <View style={styles.center} testID="document-result">
      <AppText
        variant="highlight"
        weight="semibold"
        style={styles.text}
        color={rejected ? colors.error : undefined}
      >
        {t(`documents.result.${document.status}`)}
      </AppText>
      {rejected && document.reason && <AppText style={styles.text}>{document.reason}</AppText>}
      <Button
        label={t(rejected ? 'documents.result.retry' : 'documents.result.done')}
        onPress={rejected ? onRetry : onDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  text: { textAlign: 'center' },
});
