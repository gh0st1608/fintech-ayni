import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { JoinCircleDraft } from '@/domain/circles/JoinCircleDraft';
import {
  firstInstallmentOf,
  type JoinedCircle,
  MemberBlockedError,
  MonthlyLimitExceededError,
  NationalIdRequiredError,
  PayoutMethodLimitExceededError,
  PayoutMethodRequiredError,
} from '@/domain/circles/JoinedCircle';
import {
  SlotNoLongerAvailableError,
  SlotNotAllowedError,
} from '@/domain/circles/value-objects/Slot';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { JoinSummary } from '../components/JoinSummary';
import { useJoinCircle } from '../hooks/useJoinCircle';
import { useJoinFlow } from '../JoinFlowProvider';

interface JoinConfirmScreenProps {
  /** Vuelve al paso 1 si se entra sin los pasos anteriores. */
  onStartOver: () => void;
  /** Vuelven a cada paso; el borrador conserva lo elegido. */
  onEditPayout: () => void;
  onEditInstallment: () => void;
  onEditSlot: () => void;
  onEditPayoutMethod: () => void;
  /** Scan National ID (COPAYNI-47). Sin ruta todavía: solo se muestra el motivo. */
  onVerifyIdentity?: () => void;
  /** Proof of Income para aumentar el límite (R5). Sin ruta todavía: solo se muestra el motivo. */
  onIncreaseLimit?: () => void;
  /** Tras unirse: la ruta lleva a Circles > Active. */
  onDone: () => void;
}

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
function periodDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year!, month! - 1, 1);
}

/**
 * Confirmación de la unión (COPAYNI-31). No hay diseño (pending-scope D2): resume el borrador
 * con los componentes del flujo y traduce cada rechazo a un mensaje con su acción. La firma del
 * contrato (D3) y el primer pago (D1) quedan fuera hasta que se diseñen.
 */
export function JoinConfirmScreen(props: JoinConfirmScreenProps) {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  const join = useJoinCircle();

  let body: React.ReactNode;
  if (join.data) {
    body = <Joined circle={join.data} onDone={props.onDone} />;
  } else if (!draft.isComplete()) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.confirm.missingSteps')}
        </AppText>
        <Button
          label={t('join.payoutMethod.startOver')}
          variant="secondary"
          onPress={props.onStartOver}
        />
      </View>
    );
  } else {
    body = <Review draft={draft} join={join} {...props} />;
  }

  return <Screen edges={['bottom']}>{body}</Screen>;
}

function Review({
  draft,
  join,
  onEditPayout,
  onEditInstallment,
  onEditSlot,
  onEditPayoutMethod,
  onVerifyIdentity,
  onIncreaseLimit,
}: JoinConfirmScreenProps & { draft: JoinCircleDraft; join: ReturnType<typeof useJoinCircle> }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const { payoutAmount, installment, slot, payoutMethod } = draft;

  const rows = [
    {
      label: t('join.monthlyPayIn.summaryLabel'),
      value: money(payoutAmount!),
      editLabel: t('join.monthlyPayIn.editA11y'),
      onEdit: onEditPayout,
    },
    {
      label: t('join.slot.installmentSummaryLabel'),
      value: t('join.slot.installmentSummary', {
        amount: money(installment!.installment),
        months: installment!.months,
      }),
      editLabel: t('join.slot.editInstallmentA11y'),
      onEdit: onEditInstallment,
    },
    {
      label: t('join.confirm.slotLabel'),
      value: t('join.confirm.slotValue', {
        month: formatDate(slot!.payoutDate, 'monthYear'),
        position: slot!.position,
        type: t(`join.slot.types.${slot!.type}`),
      }),
      editLabel: t('join.confirm.editSlotA11y'),
      onEdit: onEditSlot,
    },
    {
      label: t('join.payoutMethod.title'),
      value: t(`join.payoutMethod.types.${payoutMethod!}`),
      editLabel: t('join.confirm.editPayoutMethodA11y'),
      onEdit: onEditPayoutMethod,
    },
  ];

  const recovery = recoveryFor(t, money, join.error, {
    onEditSlot,
    onEditPayoutMethod,
    onVerifyIdentity,
    onIncreaseLimit,
  });

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('join.confirm.question')}
        </AppText>
        <JoinSummary rows={rows} />
        {slot!.retention.amount > 0 && (
          // La retención se muestra antes de unirse (pending-scope §3.1, COPAYNI-60).
          <InfoBanner
            message={t('join.confirm.retention', {
              amount: money(slot!.retention),
              count: Math.round(slot!.retention.amount / installment!.installment.amount),
            })}
            testID="join-retention"
          />
        )}
        <InfoBanner message={t('join.confirm.info')} />
        {join.isError && (
          <View style={styles.error}>
            <AppText accessibilityRole="alert" color={colors.error}>
              {recovery ? recovery.message : errorMessage(t, join.error)}
            </AppText>
            {recovery?.action && (
              <Button
                label={recovery.action.label}
                variant="secondary"
                onPress={recovery.action.onPress}
              />
            )}
          </View>
        )}
      </ScrollView>
      <Button
        label={t('join.confirm.submit')}
        loading={join.isPending}
        onPress={() => {
          // Un reintento tras un fallo de red repite la misma clave: no crea otra membresía.
          if (!join.isPending) join.mutate(draft);
        }}
      />
    </>
  );
}

interface Recovery {
  message: string;
  action?: { label: string; onPress: () => void };
}

/** Cada rechazo de negocio tiene su mensaje y, si la ruta existe, la acción que lo resuelve. */
function recoveryFor(
  t: TFunction,
  money: (amount: Money) => string,
  error: Error | null,
  actions: Pick<
    JoinConfirmScreenProps,
    'onEditSlot' | 'onEditPayoutMethod' | 'onVerifyIdentity' | 'onIncreaseLimit'
  >,
): Recovery | null {
  const withAction = (label: string, onPress?: () => void) =>
    onPress ? { label, onPress } : undefined;
  if (error instanceof NationalIdRequiredError) {
    return {
      message: t('join.confirm.errors.nationalIdRequired'),
      action: withAction(t('join.confirm.actions.verifyIdentity'), actions.onVerifyIdentity),
    };
  }
  if (error instanceof MonthlyLimitExceededError) {
    return {
      message: t('join.confirm.errors.monthlyLimitExceeded'),
      action: withAction(t('join.confirm.actions.increaseLimit'), actions.onIncreaseLimit),
    };
  }
  if (error instanceof PayoutMethodRequiredError) {
    return {
      message: t('join.confirm.errors.payoutMethodRequired'),
      action: withAction(t('join.confirm.actions.choosePayoutMethod'), actions.onEditPayoutMethod),
    };
  }
  if (error instanceof PayoutMethodLimitExceededError) {
    return {
      message: t('join.confirm.errors.payoutMethodLimitExceeded'),
      action: withAction(t('join.confirm.actions.choosePayoutMethod'), actions.onEditPayoutMethod),
    };
  }
  // El pago de la deuda llega con la pasarela (D1): por ahora solo se explica el motivo.
  if (error instanceof MemberBlockedError) {
    return {
      message: error.amountDue
        ? t('join.confirm.errors.memberBlocked', { amount: money(error.amountDue) })
        : t('join.confirm.errors.memberBlockedNoAmount'),
    };
  }
  if (error instanceof SlotNotAllowedError) {
    return {
      message: t('join.confirm.errors.slotNotAllowed'),
      action: withAction(t('join.confirm.actions.chooseSlot'), actions.onEditSlot),
    };
  }
  if (error instanceof SlotNoLongerAvailableError) {
    return {
      message: t('join.confirm.errors.slotNoLongerAvailable'),
      action: withAction(t('join.confirm.actions.chooseSlot'), actions.onEditSlot),
    };
  }
  return null;
}

function Joined({ circle, onDone }: { circle: JoinedCircle; onDone: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const first = firstInstallmentOf(circle);

  return (
    <>
      <View style={[styles.center, styles.content]} testID="join-success">
        <AppText
          variant="highlight"
          weight="semibold"
          accessibilityRole="header"
          style={styles.centerText}
        >
          {t('join.confirm.success.title')}
        </AppText>
        <AppText style={styles.centerText}>
          {t('join.confirm.success.payout', {
            amount: formatMoney(circle.netPayout, { trimZeroDecimals: true }),
            month: formatDate(periodDate(circle.payoutPeriod), 'monthYear'),
            position: circle.position,
            months: circle.months,
          })}
        </AppText>
        {first && (
          <AppText color={colors.textSecondary} style={styles.centerText}>
            {t('join.confirm.success.firstInstallment', {
              amount: formatMoney(first.amount, { trimZeroDecimals: true }),
              month: formatDate(periodDate(first.period), 'monthYear'),
            })}
          </AppText>
        )}
        {circle.catchUp.amount > 0 && (
          <AppText color={colors.textSecondary} style={styles.centerText}>
            {t('join.confirm.success.catchUp', {
              amount: formatMoney(circle.catchUp, { trimZeroDecimals: true }),
              month: formatDate(periodDate(circle.payoutPeriod), 'monthYear'),
            })}
          </AppText>
        )}
      </View>
      <Button label={t('join.confirm.success.viewCircles')} onPress={onDone} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  error: { gap: spacing.m },
});
