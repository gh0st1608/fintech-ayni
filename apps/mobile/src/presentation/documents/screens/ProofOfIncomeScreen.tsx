import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import ROCKET from '@assets/images/shared/rocket.png';
import { INCOME_PROOF_KINDS, type IncomeProofKind } from '@/domain/documents/KycDocument';
import { type LocalFile, MAX_PAGES } from '@/domain/documents/LocalFile';
import { Money } from '@/domain/shared/value-objects/Money';
import { useStepBack } from '@/presentation/navigation/useStepBack';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, fontFamily, radius, spacing } from '@/presentation/theme/tokens';

import { DocumentResult } from '../components/DocumentResult';
import { FileSlot } from '../components/FileSlot';
import { ScanGuideIcon } from '../components/ScanGuideIcon';
import { documentErrorMessage } from '../documentErrorMessage';
import { useSubmitProofOfIncome } from '../useDocuments';
import { useFileCapture } from '../useFileCapture';

/** Monto escrito por el usuario ("3500" o "3500.50") en unidades mayores; NaN si no es válido. */
function parseMajorAmount(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const STEPS = ['kind', 'income', 'upload'] as const;
export type ProofOfIncomeStep = (typeof STEPS)[number];

/** Paso al que vuelve "atrás"; `null` en el primero (atrás sale de la pantalla). */
export function previousIncomeStep(step: ProofOfIncomeStep): ProofOfIncomeStep | null {
  return STEPS[STEPS.indexOf(step) - 1] ?? null;
}

const UPLOAD_TIPS = ['light', 'frame'] as const;

/**
 * Pantalla de la ruta: la flecha atrás vuelve al paso anterior del comprobante y, desde el primero,
 * sale. Al terminar ("Listo") deja salir sin interceptar.
 */
export function ProofOfIncomeFlowScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<ProofOfIncomeStep>('kind');
  const [leaving, setLeaving] = useState(false);
  const previous = previousIncomeStep(step);
  useStepBack(previous !== null && !leaving, () => {
    if (previous) setStep(previous);
  });
  // Se sale cuando la intercepción ya se quitó.
  useEffect(() => {
    if (leaving) onDone();
  }, [leaving, onDone]);

  return <ProofOfIncomeScreen step={step} onStepChange={setStep} onDone={() => setLeaving(true)} />;
}

/**
 * Proof of Income (COPAYNI-48) en los tres pasos del Figma: el tipo de comprobante (55:10630), el
 * ingreso mensual (55:10662) y la guía para subirlo (55:10677), de una a diez páginas (fotos o
 * PDF). El ingreso aprobado fija el límite mensual (R5).
 *
 * La ruta puede controlar el paso (`step` y `onStepChange`) para que la flecha atrás vuelva al
 * paso anterior; sin ellos, la pantalla lo maneja sola.
 */
export function ProofOfIncomeScreen({
  onDone,
  step: controlledStep,
  onStepChange,
}: {
  onDone: () => void;
  step?: ProofOfIncomeStep;
  onStepChange?: (step: ProofOfIncomeStep) => void;
}) {
  const { t } = useTranslation();
  const { defaultCurrency } = useContainer().config;
  const [ownStep, setOwnStep] = useState<ProofOfIncomeStep>('kind');
  const step = controlledStep ?? ownStep;
  const setStep = onStepChange ?? setOwnStep;
  const [kind, setKind] = useState<IncomeProofKind>('hrLetter');
  const [income, setIncome] = useState('');
  const [pages, setPages] = useState<LocalFile[]>([]);
  const { capture, error: captureError } = useFileCapture();
  const submit = useSubmitProofOfIncome();
  const major = parseMajorAmount(income);

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

  if (step === 'kind') {
    return (
      <Screen edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <RadioGroup label={t('documents.income.kindLabel')}>
            {INCOME_PROOF_KINDS.map((option) => (
              <RadioCard
                key={option}
                title={t(`documents.income.kinds.${option}`)}
                description={t(`documents.income.kindDescriptions.${option}`)}
                icon="document-text-outline"
                selected={kind === option}
                onSelect={() => setKind(option)}
                testID={`income-kind-${option}`}
              />
            ))}
          </RadioGroup>
          <InfoBanner message={t('documents.income.moreDocuments')} illustration={ROCKET} />
        </ScrollView>
        <Button label={t('documents.income.next')} onPress={() => setStep('income')} />
      </Screen>
    );
  }

  if (step === 'income') {
    return (
      <Screen edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="highlight" weight="semibold" accessibilityRole="header">
            {t('documents.income.incomeTitle')}
          </AppText>
          <AppText color={colors.neutral500}>{t('documents.income.incomeIntro')}</AppText>
          <View style={styles.amountBox}>
            <TextInput
              accessibilityLabel={t('documents.income.amount')}
              value={income}
              onChangeText={setIncome}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.secondary300}
              style={styles.amountInput}
              testID="monthly-income"
            />
            <AppText style={styles.amountCurrency} importantForAccessibility="no">
              {defaultCurrency}
            </AppText>
          </View>
        </ScrollView>
        {/* Figma: Next queda deshabilitado mientras el ingreso no sea válido. */}
        <Button
          label={t('documents.income.next')}
          disabled={!(major > 0)}
          onPress={() => setStep('upload')}
        />
      </Screen>
    );
  }

  const addPage = (source: 'photo' | 'image' | 'pdf') =>
    void capture(source).then((file) => {
      if (file) setPages((current) => [...current, file].slice(0, MAX_PAGES));
    });
  const replacePage = (index: number, source: 'photo' | 'image') =>
    void capture(source).then((file) => {
      if (file) setPages((current) => current.map((p, i) => (i === index ? file : p)));
    });
  const error = captureError ?? submit.error;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScanGuideIcon />
        <AppText variant="highlight" weight="semibold">
          {t('documents.income.uploadGuide')}
        </AppText>
        <View style={styles.tips}>
          {UPLOAD_TIPS.map((tip) => (
            <AppText key={tip} variant="caption" color={colors.neutral500}>
              {`•  ${t(`documents.income.uploadTips.${tip}`)}`}
            </AppText>
          ))}
        </View>
        <InfoBanner message={t(`documents.income.uploadHelp.${kind}`)} illustration={ROCKET} />
        {pages.map((page, index) => (
          <FileSlot
            key={page.uri}
            title={t('documents.income.page', { number: index + 1 })}
            file={page}
            onTakePhoto={() => replacePage(index, 'photo')}
            onPickImage={() => replacePage(index, 'image')}
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
          if (submit.isPending || !(major > 0)) return;
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
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary100,
    backgroundColor: colors.surface,
  },
  amountInput: {
    minWidth: 40,
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    color: colors.black,
    textAlign: 'right',
  },
  amountCurrency: { fontFamily: fontFamily.semibold, fontSize: 28, color: colors.black },
  tips: { gap: spacing.xs },
});
