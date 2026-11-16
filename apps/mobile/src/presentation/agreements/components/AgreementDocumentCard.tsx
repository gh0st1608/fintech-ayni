import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { AgreementDocument } from '@/domain/agreements/MembershipAgreement';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Card } from '@/presentation/shared/components/Card';
import { colors, spacing } from '@/presentation/theme/tokens';

interface AgreementDocumentCardProps {
  document: AgreementDocument;
  read: boolean;
  onOpen: () => void;
}

/**
 * Tarjeta de cada documento (Figma 2051:2344): nombre, para qué sirve, si ya se leyó y el acceso
 * a leerlo. Hay que abrir los dos antes de poder pedir el código.
 */
export function AgreementDocumentCard({ document, read, onOpen }: AgreementDocumentCardProps) {
  const { t } = useTranslation();
  const title = t(`agreements.documents.${document}.title`);

  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={t('agreements.sign.openDocument', { document: title })}
      testID={`agreement-document-${document}`}
    >
      <View style={styles.heading}>
        <Ionicons name="document-text-outline" size={20} color={colors.primary} />
        <AppText weight="semibold" style={styles.title}>
          {title}
        </AppText>
        <Badge
          label={t(read ? 'agreements.documents.read' : 'agreements.documents.unread')}
          tone={read ? 'successSubtle' : 'subtle'}
        />
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={styles.description}>
        {t(`agreements.documents.${document}.description`)}
      </AppText>
      <View style={styles.link}>
        <AppText variant="caption" weight="semibold" color={colors.primary}>
          {t('agreements.documents.readAction')}
        </AppText>
        <Ionicons name="arrow-forward" size={16} color={colors.primary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  description: { marginTop: spacing.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.sm },
});
