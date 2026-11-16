import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  AGREEMENT_DOCUMENTS,
  type AgreementDocument,
} from '@/domain/agreements/MembershipAgreement';
import { useReadAgreementDocument } from '@/presentation/agreements/useAgreements';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

interface AgreementDocumentScreenProps {
  agreementId: string;
  /** Llega de la URL, así que puede ser cualquier texto: la pantalla lo valida. */
  document: string;
  /** Vuelve a la firma; al volver, el documento ya cuenta como leído. */
  onDone: () => void;
}

const isAgreementDocument = (value: string): value is AgreementDocument =>
  (AGREEMENT_DOCUMENTS as readonly string[]).includes(value);

/**
 * Lectura de un documento antes de firmarlo (COPAYNI-89). Muestra el texto que se guardó al
 * unirse —no la plantilla vigente—, porque la evidencia es lo que la persona leyó y firmó.
 * Abrir esta pantalla es lo que marca el documento como leído.
 *
 * Sin diseño propio en el Figma (D3 solo cubre la pantalla de firma): se resuelve con el design
 * system. El texto es provisional hasta que Legal entregue el definitivo (pending-scope §3.3).
 */
export function AgreementDocumentScreen({
  agreementId,
  document,
  onDone,
}: AgreementDocumentScreenProps) {
  if (!isAgreementDocument(document)) {
    return <UnknownDocument onDone={onDone} />;
  }
  return <KnownDocument agreementId={agreementId} document={document} onDone={onDone} />;
}

function UnknownDocument({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen edges={['bottom']}>
      <View style={styles.center}>
        <EmptyState title={t('agreements.documents.unknown')} />
        <Button label={t('agreements.sign.done')} onPress={onDone} />
      </View>
    </Screen>
  );
}

function KnownDocument({
  agreementId,
  document,
  onDone,
}: {
  agreementId: string;
  document: AgreementDocument;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const query = useReadAgreementDocument(agreementId, document);

  if (query.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, query.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void query.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t(`agreements.documents.${document}.title`)}
        </AppText>
        <AppText variant="footnote" color={colors.neutral600}>
          {t('agreements.documents.version', { version: query.data.version })}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.draft}>
          {t('agreements.documents.provisional')}
        </AppText>
        <AppText style={styles.body}>{query.data.text}</AppText>
      </ScrollView>
      <Button label={t('agreements.documents.readDone')} onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.sm, paddingVertical: spacing.l },
  draft: { marginBottom: spacing.sm },
});
