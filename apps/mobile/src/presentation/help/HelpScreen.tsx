import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { type Faq, filterFaqs } from '@/domain/help/Help';
import { useHelp } from '@/presentation/help/useHelp';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

/**
 * Ayuda (COPAYNI-83, Figma 2052:2484): búsqueda, preguntas desplegables, la política de pagos y el
 * contacto por WhatsApp. El chat del Figma queda fuera hasta elegir su proveedor.
 */
export function HelpScreen({ onOpenPolicy }: { onOpenPolicy: () => void }) {
  const { t } = useTranslation();
  const help = useHelp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  if (help.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (help.isError) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, help.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void help.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const faqs = filterFaqs(help.data.faqs, query);
  const whatsappUrl = help.data.whatsappUrl;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('help.searchLabel')}
          hideLabel
          placeholder={t('help.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          testID="help-search"
        />
        <AppText variant="title" weight="semibold">
          {t('help.faqTitle')}
        </AppText>
        {faqs.length === 0 ? (
          <AppText color={colors.neutral600}>
            {help.data.faqs.length === 0 ? t('help.noFaqs') : t('help.noResults')}
          </AppText>
        ) : (
          faqs.map((faq) => (
            <FaqItem
              key={faq.id}
              faq={faq}
              expanded={open === faq.id}
              onToggle={() => setOpen(open === faq.id ? null : faq.id)}
            />
          ))
        )}
        <Card
          onPress={onOpenPolicy}
          accessibilityLabel={t('help.policyTitle')}
          style={styles.policy}
        >
          <View style={styles.policyHeader}>
            <Ionicons name="document-text-outline" size={22} color={colors.primary} />
            <AppText weight="semibold" style={styles.flex}>
              {t('help.policyTitle')}
            </AppText>
            <Ionicons name="chevron-forward" size={20} color={colors.neutral600} />
          </View>
          <AppText color={colors.textSecondary}>{t('help.policySummary')}</AppText>
        </Card>
        {whatsappUrl && (
          <Button
            label={t('help.whatsapp')}
            variant="secondary"
            onPress={() => void Linking.openURL(whatsappUrl)}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function FaqItem({
  faq,
  expanded,
  onToggle,
}: {
  faq: Faq;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={faq.question}
      onPress={onToggle}
      style={styles.faq}
      testID={`faq-${faq.id}`}
    >
      <View style={styles.faqHeader}>
        <AppText weight="semibold" style={styles.flex}>
          {faq.question}
        </AppText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.neutral600}
        />
      </View>
      {expanded && <AppText color={colors.textSecondary}>{faq.answer}</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  faq: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary200,
    backgroundColor: colors.surface,
  },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  policy: { gap: spacing.xs, backgroundColor: colors.background },
  policyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
