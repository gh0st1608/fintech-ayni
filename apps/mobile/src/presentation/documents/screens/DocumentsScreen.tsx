import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { DocumentSummaryStatus, DocumentType } from '@/domain/documents/KycDocument';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useDocuments } from '../useDocuments';

interface DocumentsScreenProps {
  onOpen: Partial<Record<DocumentType, () => void>>;
}

const STATUS_ICON = {
  approved: { name: 'checkmark-circle', color: colors.success },
  inReview: { name: 'time-outline', color: colors.primary },
  rejected: { name: 'close-circle', color: colors.error },
  notSubmitted: { name: 'add-circle-outline', color: colors.neutral500 },
} as const satisfies Record<DocumentSummaryStatus, { name: string; color: string }>;

const STATUS_COLOR = {
  approved: colors.success,
  inReview: colors.primary,
  rejected: colors.error,
  notSubmitted: colors.neutral500,
} as const satisfies Record<DocumentSummaryStatus, string>;

const ICONS = {
  nationalId: 'id-card-outline',
  proofOfIncome: 'cash-outline',
  additional: 'documents-outline',
} as const satisfies Record<DocumentType, string>;

/**
 * My Documents (Figma 55:10523, COPAYNI-46): cada documento con para qué sirve, su estado y el
 * acceso para enviarlo o reenviarlo. Los documentos adicionales del Figma (recibo de servicios,
 * licencia, carnés) se agrupan en una fila hasta tener su historia (COPAYNI-49).
 */
export function DocumentsScreen({ onOpen }: DocumentsScreenProps) {
  const { t } = useTranslation();
  const documents = useDocuments();

  if (documents.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (documents.isError && !documents.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, documents.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void documents.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const { summary } = documents.data;
  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={documents.isRefetching}
            onRefresh={() => void documents.refetch()}
          />
        }
      >
        <AppText color={colors.neutral500}>{t('documents.list.intro')}</AppText>
        {(Object.keys(ICONS) as DocumentType[]).map((type) => {
          const status = summary[type];
          // Un aprobado no se reenvía; un adicional no tiene pantalla todavía (COPAYNI-49).
          const open = status === 'approved' ? undefined : onOpen[type];
          const icon = STATUS_ICON[status];
          // Figma 55:10523: lo pendiente dice para qué sirve el documento; si no, su estado.
          const required = status === 'notSubmitted' && type !== 'additional';
          const note = required ? t(`documents.required.${type}`) : t(`documents.status.${status}`);
          return (
            <ListItem
              key={type}
              title={t(`documents.types.${type}`)}
              description={t(`documents.descriptions.${type}`)}
              extra={
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={required ? colors.primary : STATUS_COLOR[status]}
                >
                  {note}
                </AppText>
              }
              accessibilityHint={note}
              icon={ICONS[type]}
              onPress={open}
              trailing={
                open ? undefined : <Ionicons name={icon.name} size={24} color={icon.color} />
              }
              testID={`document-${type}`}
            />
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  content: { gap: spacing.m, paddingVertical: spacing.l },
});
