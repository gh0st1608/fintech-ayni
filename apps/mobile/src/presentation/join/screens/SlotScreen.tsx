import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import {
  SlotNoLongerAvailableError,
  type Slot,
  type SlotGroup,
  type SlotType,
} from '@/domain/circles/value-objects/Slot';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, spacing } from '@/presentation/theme/tokens';

import { JoinSummary } from '../components/JoinSummary';
import { useAvailableSlots, useConfirmSlot } from '../hooks/useSlots';
import { useJoinFlow } from '../JoinFlowProvider';
import { JOIN_FLOW_STEPS } from './PayoutAmountScreen';

interface SlotScreenProps {
  /** Vuelven al paso 1 o 2; el borrador conserva lo elegido. */
  onEditPayout: () => void;
  onEditInstallment: () => void;
  /** Se llama con el slot ya revalidado y guardado en el borrador; la ruta navega al paso 4. */
  onNext: () => void;
}

/** Paso 3 de 4 (Figma 55:9377 y 55:9444): el mes de cobro según rapidez, fees o retorno. */
export function SlotScreen({ onEditPayout, onEditInstallment, onNext }: SlotScreenProps) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { draft } = useJoinFlow();
  const { payoutAmount: payout, installment } = draft;
  const slots = useAvailableSlots(payout, installment, draft.slotsCircleId());

  let body: React.ReactNode;
  if (!payout || !installment) {
    // Solo pasa si se entra sin los pasos anteriores (p. ej. un deep link).
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.slot.missingSteps')}
        </AppText>
        <Button
          label={t('join.monthlyPayIn.choosePayout')}
          variant="secondary"
          onPress={onEditPayout}
        />
      </View>
    );
  } else if (slots.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (slots.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, slots.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => slots.refetch()} />
      </View>
    );
  } else {
    body = (
      <SlotPicker payout={payout} installment={installment} groups={slots.data} onNext={onNext} />
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stepper
        current={3}
        total={JOIN_FLOW_STEPS}
        accessibilityLabel={t('join.step', { current: 3, total: JOIN_FLOW_STEPS })}
      />
      {payout && installment && (
        <JoinSummary
          rows={[
            {
              label: t('join.monthlyPayIn.summaryLabel'),
              value: formatMoney(payout, { trimZeroDecimals: true }),
              editLabel: t('join.monthlyPayIn.editA11y'),
              onEdit: onEditPayout,
            },
            {
              label: t('join.slot.installmentSummaryLabel'),
              value: t('join.slot.installmentSummary', {
                amount: formatMoney(installment.installment, { trimZeroDecimals: true }),
                months: installment.months,
              }),
              editLabel: t('join.slot.editInstallmentA11y'),
              onEdit: onEditInstallment,
            },
          ]}
        />
      )}
      {body}
    </Screen>
  );
}

function SlotPicker({
  payout,
  installment,
  groups,
  onNext,
}: {
  payout: Money;
  installment: InstallmentOption;
  groups: SlotGroup[];
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const { draft, setSlot } = useJoinFlow();
  const confirm = useConfirmSlot(payout, installment, draft.slotsCircleId());

  // Al volver del paso 4 se parte del slot del borrador si sigue libre.
  const all = groups.flatMap((group) => group.slots);
  const previous = all.find((slot) => slot.selectable && slot.position === draft.slot?.position);
  const [pickedPosition, setPickedPosition] = useState<number | null>(null);
  const selected =
    all.find((slot) => slot.selectable && slot.position === pickedPosition) ??
    (pickedPosition === null ? previous : undefined) ??
    null;
  const [type, setType] = useState<SlotType>(
    previous?.type ?? groups.find((group) => group.slots.length > 0)?.type ?? 'fastestPayout',
  );
  const group = groups.find((entry) => entry.type === type);

  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const monthYear = (slot: Slot) => formatDate(slot.payoutDate, 'monthYear');
  const describe = (slot: Slot) => {
    const parts = [t('join.slot.position', { position: slot.position })];
    if (slot.fee.amount > 0) parts.push(t('join.slot.fee', { amount: money(slot.fee) }));
    else parts.push(t('join.slot.zeroFees'));
    if (slot.discount.amount > 0) {
      parts.push(t('join.slot.discount', { amount: money(slot.discount) }));
    }
    if (slot.retention.amount > 0) {
      parts.push(t('join.slot.retention', { amount: money(slot.retention) }));
    }
    if (slot.catchUp.amount > 0) {
      parts.push(t('join.slot.catchUp', { amount: money(slot.catchUp) }));
    }
    return parts.join(' · ');
  };

  const conflict = confirm.error instanceof SlotNoLongerAvailableError;
  const proceed = () => {
    if (!selected) return;
    confirm.mutate(selected.position, {
      onSuccess: (slot) => {
        setSlot(slot);
        onNext();
      },
      onError: (error) => {
        if (error instanceof SlotNoLongerAvailableError) setPickedPosition(null);
      },
    });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('join.slot.question')}
        </AppText>
        <SegmentedTabs
          options={groups.map((entry) => ({
            key: entry.type,
            label: t(`join.slot.types.${entry.type}`),
          }))}
          selectedKey={type}
          onChange={setType}
          testID="slot-types"
        />
        {group && group.slots.length > 0 ? (
          <>
            <AppText variant="caption" color={colors.neutral600} testID="slot-type-summary">
              {`${t('join.slot.typeRange', {
                from: monthYear(group.slots[0]!),
                to: monthYear(group.slots[group.slots.length - 1]!),
              })} ${t(`join.slot.typeTag.${type}`)}`}
            </AppText>
            <RadioGroup label={t('join.slot.slotsLabel')}>
              {group.slots.map((slot) => (
                <RadioCard
                  key={slot.position}
                  title={monthYear(slot)}
                  description={describe(slot)}
                  selected={selected?.position === slot.position}
                  onSelect={() => {
                    confirm.reset();
                    setPickedPosition(slot.position);
                  }}
                  disabled={!slot.selectable}
                  disabledReason={
                    slot.notAllowedReason
                      ? t(`join.slot.notAllowed.${slot.notAllowedReason}`)
                      : t('join.slot.taken')
                  }
                  testID={`slot-${slot.position}`}
                />
              ))}
            </RadioGroup>
          </>
        ) : (
          <AppText>{t('join.slot.typeEmpty')}</AppText>
        )}
        {confirm.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {conflict ? t('join.slot.noLongerAvailable') : errorMessage(t, confirm.error)}
          </AppText>
        )}
        <InfoBanner message={t('join.slot.adminFeesInfo')} />
      </ScrollView>
      <Button
        label={
          selected
            ? t('join.slot.continueWith', { month: formatDate(selected.payoutDate, 'month') })
            : t('join.next')
        }
        disabled={!selected}
        loading={confirm.isPending}
        onPress={proceed}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
