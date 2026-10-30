import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { INCOME_PROOF_KINDS, type IncomeProofKind } from '@/domain/documents/KycDocument';
import { type LocalFile, MAX_PAGES } from '@/domain/documents/LocalFile';
import { Money } from '@/domain/shared/value-objects/Money';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { DocumentResult } from '../components/DocumentResult';
import { FileSlot } from '../components/FileSlot';
import { documentErrorMessage } from '../documentErrorMessage';
import { useSubmitProofOfIncome } from '../useDocuments';
import { useFileCapture } from '../useFileCapture';

/** Monto escrito por el usuario ("3500" o "3500.50") en unidades mayores; NaN si no es válido. */
function parseMajorAmount(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/**
 * Proof of Income (COPAYNI-48): el ingreso mensual declarado y el comprobante, de una a diez
 * páginas (fotos o PDF). El ingreso aprobado fija el límite mensual (R5). Sin el contexto de
 * diseño (límite de Figma).
 */
export function ProofOfIncomeScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { defaultCurrency } = useContainer().config;
  const [kind, setKind] = useState<IncomeProofKind>('hrLetter');
  const [income, setIncome] = useState('');
  const [pages, setPages] = useState<LocalFile[]>([]);
  const [incomeError, setIncomeError] = useState(false);
  const { capture, error: captureError } = useFileCapture();
  const submit = useSubmitProofOfIncome();

  if (submit.data) {
    return (
      <Screen edges={['bottom']}>
        <DocumentResult
          document={submit.data}
          onDone={onDone}
          onRetry={() => {
            setPages([]);
            submit.reset();
          }}
        />
      </Screen>
    );
  }

  const addPage = (source: 'photo' | 'image' | 'pdf') =>
    void capture(source).then((file) => {
      if (file) setPages((current) => [...current, file].slice(0, MAX_PAGES));
    });
  const error = captureError ?? submit.error;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('documents.income.amount')}
          value={income}
          onChangeText={(value) => {
            setIncome(value);
            setIncomeError(false);
          }}
          keyboardType="decimal-pad"
          error={incomeError ? t('documents.income.invalidAmount') : undefined}
          testID="monthly-income"
        />
        <RadioGroup label={t('documents.income.kindLabel')}>
          {INCOME_PROOF_KINDS.map((option) => (
            <RadioCard
              key={option}
              title={t(`documents.income.kinds.${option}`)}
              selected={kind === option}
              onSelect={() => setKind(option)}
              testID={`income-kind-${option}`}
            />
          ))}
        </RadioGroup>
        {pages.map((page, index) => (
          <FileSlot
            key={page.uri}
            title={t('documents.income.page', { number: index + 1 })}
            file={page}
            onTakePhoto={() =>
              void capture('photo').then((file) => {
                if (file) setPages((current) => current.map((p, i) => (i === index ? file : p)));
              })
            }
            onPickImage={() =>
              void capture('image').then((file) => {
                if (file) setPages((current) => current.map((p, i) => (i === index ? file : p)));
              })
            }
            onRemove={() => setPages((current) => current.filter((_, i) => i !== index))}
            testID={`page-${index + 1}`}
          />
        ))}
        {pages.length < MAX_PAGES && (
          <FileSlot
            title={t('documents.income.addPage')}
            file={null}
            onTakePhoto={() => addPage('photo')}
            onPickImage={() => addPage('image')}
            onPickPdf={() => addPage('pdf')}
            testID="page-new"
          />
        )}
        {error !== null && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {documentErrorMessage(t, error)}
          </AppText>
        )}
      </ScrollView>
      <Button
        label={t('documents.income.submit')}
        disabled={pages.length === 0}
        loading={submit.isPending}
        onPress={() => {
          const major = parseMajorAmount(income);
          if (!(major > 0)) {
            setIncomeError(true);
            return;
          }
          if (submit.isPending) return;
          submit.mutate({
            kind,
            monthlyIncome: Money.fromMajor(major, defaultCurrency),
            pages,
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
