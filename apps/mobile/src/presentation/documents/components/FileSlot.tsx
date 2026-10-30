import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import type { LocalFile } from '@/domain/documents/LocalFile';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

interface FileSlotProps {
  title: string;
  file: LocalFile | null;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onPickPdf?: () => void;
  onRemove?: () => void;
  testID?: string;
}

/** Un archivo a subir: vista previa si es imagen, y las acciones para capturarlo o quitarlo. */
export function FileSlot({
  title,
  file,
  onTakePhoto,
  onPickImage,
  onPickPdf,
  onRemove,
  testID,
}: FileSlotProps) {
  const { t } = useTranslation();
  return (
    <Card testID={testID} style={styles.card}>
      <AppText weight="semibold">{title}</AppText>
      {file ? (
        file.mimeType === 'application/pdf' ? (
          <AppText color={colors.neutral500}>{t('documents.capture.pdfSelected')}</AppText>
        ) : (
          <Image
            source={{ uri: file.uri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityLabel={t('documents.capture.preview', { title })}
          />
        )
      ) : (
        <AppText variant="caption" color={colors.neutral500}>
          {t('documents.capture.empty')}
        </AppText>
      )}
      <View style={styles.actions}>
        <Button
          label={t(file ? 'documents.capture.retake' : 'documents.capture.takePhoto')}
          variant="secondary"
          onPress={onTakePhoto}
          style={styles.action}
        />
        <Button
          label={t('documents.capture.gallery')}
          variant="secondary"
          onPress={onPickImage}
          style={styles.action}
        />
      </View>
      {onPickPdf && !file && (
        <Button label={t('documents.capture.pdf')} variant="secondary" onPress={onPickPdf} />
      )}
      {onRemove && file && (
        <Button label={t('documents.capture.remove')} variant="secondary" onPress={onRemove} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.m },
  preview: { width: '100%', aspectRatio: 1.58, borderRadius: radius.md },
  actions: { flexDirection: 'row', gap: spacing.m },
  action: { flex: 1 },
});
