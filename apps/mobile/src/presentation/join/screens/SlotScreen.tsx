import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import ROCKET from '@assets/images/shared/rocket.png';
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
import { Badge } from '@/presentation/shared/components/Badge';
import { Card } from '@/presentation/shared/components/Card';
import { Chevron } from '@/presentation/shared/components/Chevron';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

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

const TYPE_ICON = {
  fastestPayout: 'flash-outline',
  lowestFees: 'happy-outline',
  highestReturn: 'trending-up-outline',
} as const satisfies Record<SlotType, React.ComponentProps<typeof Ionicons>['name']>;

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
  // Figma 55:9377: primero se elige el tipo de turno; 55:9444: luego el mes, con pestañas.
  const [type, setType] = useState<SlotType | null>(previous?.type ?? null);
  const group = groups.find((entry) => entry.type === type);

  const monthYear = (slot: Slot) => formatDate(slot.payoutDate, 'monthYear');
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

  if (type === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('join.slot.question')}
        </AppText>
        {groups.map((entry) => {
          const first = entry.slots[0];
          const last = entry.slots[entry.slots.length - 1];
          const range =
            first && last
              ? t(`join.slot.typeSlots.${entry.type}`, {
                  from: formatDate(first.payoutDate, 'month'),
                  to: formatDate(last.payoutDate, 'month'),
                })
              : t('join.slot.typeEmpty');
          const tag =
            entry.type === 'lowestFees' ? null : t(`join.slot.typeTagShort.${entry.type}`);
          return (
            <Card
              key={entry.type}
              onPress={() => setType(entry.type)}
              disabled={entry.slots.length === 0}
              accessibilityLabel={[t(`join.slot.types.${entry.type}`), tag, range]
                .filter(Boolean)
                .join('. ')}
              style={styles.typeCard}
              testID={`slot-type-${entry.type}`}
            >
              <View style={styles.typeText}>
                <View style={styles.typeTitle}>
                  <Ionicons name={TYPE_ICON[entry.type]} size={18} color={colors.primary} />
                  <AppText weight="semibold" style={styles.flex}>
                    {t(`join.slot.types.${entry.type}`)}
                  </AppText>
                  {tag && (
                    <AppText
                      variant="caption"
                      color={entry.type === 'highestReturn' ? colors.success : colors.black}
                    >
                      {tag}
                    </AppText>
                  )}
                </View>
                <AppText variant="caption" color={colors.neutral500}>
                  {range}
                </AppText>
              </View>
              <Chevron />
            </Card>
          );
        })}
        <InfoBanner message={t('join.monthlyPayIn.info')} illustration={ROCKET} />
      </ScrollView>
    );
  }

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
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('join.slot.slotsLabel')}
              style={styles.grid}
            >
              {group.slots.map((slot) => (
                <SlotCard
                  key={slot.position}
                  slot={slot}
                  selected={selected?.position === slot.position}
                  onSelect={() => {
                    confirm.reset();
                    setPickedPosition(slot.position);
                  }}
                />
              ))}
            </View>
          </>
        ) : (
          <AppText>{t('join.slot.typeEmpty')}</AppText>
        )}
        {confirm.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {conflict ? t('join.slot.noLongerAvailable') : errorMessage(t, confirm.error)}
          </AppText>
        )}
        <InfoBanner message={t('join.slot.adminFeesInfo')} illustration={ROCKET} />
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

/** Tarjeta de mes del Figma: mes y turno arriba; fees o "Sin fees", descuento y ajustes abajo. */
function SlotCard({
  slot,
  selected,
  onSelect,
}: {
  slot: Slot;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const details: { text: string; color: string }[] = [];
  if (slot.fee.amount > 0) {
    details.push({ text: t('join.slot.fee', { amount: money(slot.fee) }), color: colors.black });
  }
  if (slot.discount.amount > 0) {
    details.push({
      text: t('join.slot.discount', { amount: money(slot.discount) }),
      color: colors.success,
    });
  }
  if (slot.retention.amount > 0) {
    details.push({
      text: t('join.slot.retention', { amount: money(slot.retention) }),
      color: colors.neutral600,
    });
  }
  if (slot.catchUp.amount > 0) {
    details.push({
      text: t('join.slot.catchUp', { amount: money(slot.catchUp) }),
      color: colors.neutral600,
    });
  }
  const reason = slot.notAllowedReason
    ? t(`join.slot.notAllowed.${slot.notAllowedReason}`)
    : t('join.slot.taken');
  const month = formatDate(slot.payoutDate, 'monthYear');
  const position = t('join.slot.position', { position: slot.position });
  const label = [
    month,
    position,
    slot.fee.amount > 0 ? null : t('join.slot.zeroFees'),
    ...details.map(({ text }) => text),
    slot.selectable ? null : reason,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: !slot.selectable }}
      disabled={!slot.selectable}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.slot,
        selected && styles.slotSelected,
        !slot.selectable && styles.slotDisabled,
        pressed && styles.pressed,
      ]}
      testID={`slot-${slot.position}`}
    >
      <View style={styles.slotHeader} importantForAccessibility="no-hide-descendants">
        <AppText weight="semibold" color={selected ? colors.primary : colors.black}>
          {month}
        </AppText>
        <AppText variant="caption">{position}</AppText>
      </View>
      <View style={styles.slotDetails} importantForAccessibility="no-hide-descendants">
        {slot.fee.amount === 0 && <Badge label={t('join.slot.zeroFees')} />}
        {details.map(({ text, color }) => (
          <AppText key={text} variant="caption" weight="semibold" color={color}>
            {text}
          </AppText>
        ))}
        {!slot.selectable && (
          <AppText variant="footnote" color={colors.neutral600}>
            {reason}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  flex: { flex: 1 },
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  typeText: { flex: 1, gap: spacing.xs },
  typeTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.m,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary300,
    backgroundColor: colors.background,
  },
  slotSelected: { borderWidth: 2, borderColor: colors.primary },
  slotDisabled: { opacity: 0.5 },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  slotDetails: { gap: spacing.xs, alignItems: 'flex-start' },
  pressed: { opacity: 0.85 },
});
