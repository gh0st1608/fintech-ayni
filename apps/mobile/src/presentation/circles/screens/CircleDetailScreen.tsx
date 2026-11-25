import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { CircleTurn, MyCircleDetail } from '@/domain/circles/MyCircleDetail';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

export const myCircleQueryKey = (circleId: string) =>
  ['circles', 'mine', 'detail', circleId] as const;

interface CircleDetailScreenProps {
  circleId: string;
  /** Pagar la cuota pendiente de este círculo (D1). */
  onPay: (installmentId: string) => void;
}

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
const periodDate = (period: string) => `${period}-01T12:00:00`;

/** Un día `YYYY-MM-DD` a mediodía, para formatearlo sin que el huso lo corra de día. */
const atNoon = (date: string) => `${date}T12:00:00`;

/**
 * Detalle de mi círculo (diseño D8 aprobado, COPAYNI-88): pozo y progreso, mi turno y mi cuota,
 * el próximo vencimiento con acceso a pagar, y los turnos con los nombres abreviados de los demás.
 */
export function CircleDetailScreen({ circleId, onPay }: CircleDetailScreenProps) {
  const { t } = useTranslation();
  const { circles } = useContainer();
  const detail = useQuery({
    queryKey: myCircleQueryKey(circleId),
    queryFn: ({ signal }) => circles.getMyCircle.execute(circleId, signal),
  });

  return (
    <Screen edges={['bottom']}>
      {detail.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : detail.isError ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, detail.error)}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={() => detail.refetch()} />
        </View>
      ) : (
        <Detail circle={detail.data} onPay={onPay} />
      )}
    </Screen>
  );
}

function Detail({ circle, onPay }: { circle: MyCircleDetail; onPay: (id: string) => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const monthYear = (period: string) => formatDate(periodDate(period), 'monthYear');
  const day = (date: string) => formatDate(atNoon(date), 'date');
  const turnIndex = circle.currentTurn ? circle.currentTurn - 1 : 0;
  const installment = circle.installments[Math.min(turnIndex, circle.installments.length - 1)]!;
  // La unidad se traduce en la app a partir de la cadencia, que es un enumerado: la etiqueta que
  // manda el servidor está en un solo idioma y esta pantalla se muestra en el del usuario.
  const unit = t(`circles.cadences.${circle.cadence}.turn`);
  const perUnit = t(`circles.cadences.${circle.cadence}.per`);
  /** «Semana 3 · 18 nov»: el ordinal y la fecha que calculó el servidor (COPAYNI-117). */
  const turnLabel = (turn: CircleTurn) =>
    t('circles.detail.turnValue', { unit, turn: turn.turn, date: day(turn.payoutOn) });
  const myTurn = circle.turns.find(({ isMe }) => isMe);

  return (
    <ScrollView contentContainerStyle={styles.content} testID="circle-detail">
      <View style={styles.hero} testID="circle-detail-summary">
        <View style={styles.row}>
          <AppText variant="caption" color={colors.neutral600} style={styles.flex}>
            {t('circles.detail.pot')}
          </AppText>
          <Badge label={t(`circles.detail.states.${circle.state}`)} tone="subtle" />
        </View>
        <AppText variant="display" weight="semibold">
          {money(circle.payout)}
        </AppText>
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('circles.detail.progressA11y')}
          accessibilityValue={{ min: 0, max: circle.turnCount, now: circle.currentTurn ?? 0 }}
        >
          {Array.from({ length: circle.turnCount }, (_unused, index) => (
            <View
              key={index}
              style={[
                styles.segment,
                circle.currentTurn !== null && index < circle.currentTurn && styles.segmentDone,
              ]}
            />
          ))}
        </View>
        <AppText variant="caption" color={colors.neutral600} testID="circle-detail-progress">
          {circle.currentTurn === null
            ? t('circles.detail.startsOn', { date: day(circle.startsOnDate) })
            : t('circles.detail.progress', {
                current: circle.currentTurn,
                total: circle.turnCount,
                end: day(circle.endsOnDate),
              })}
        </AppText>
      </View>

      <Card testID="circle-detail-mine">
        <View style={styles.rows}>
          <Row
            label={t('circles.detail.yourTurn')}
            value={
              myTurn
                ? turnLabel(myTurn)
                : t('circles.detail.turnValue', {
                    unit,
                    turn: circle.position,
                    date: monthYear(circle.payoutPeriod),
                  })
            }
            highlight
          />
          <Row
            label={t('circles.detail.yourInstallment')}
            value={t('circles.detail.installmentValue', { amount: money(installment), perUnit })}
          />
          {circle.retention.amount > 0 && (
            <Row label={t('circles.detail.retention')} value={money(circle.retention)} />
          )}
          <Row
            label={t('circles.detail.nextDue')}
            value={
              circle.nextDue
                ? formatDate(`${circle.nextDue.dueOn}T12:00:00`, 'date')
                : t('circles.detail.nothingDue')
            }
          />
        </View>
      </Card>
      {circle.nextDue && (
        <Button
          label={t('circles.detail.pay', { amount: money(circle.nextDue.amount) })}
          onPress={() => onPay(circle.nextDue!.installmentId)}
        />
      )}

      <AppText weight="semibold" accessibilityRole="header">
        {t('circles.detail.turns')}
      </AppText>
      <Card testID="circle-detail-turns">
        <View style={styles.rows}>
          {circle.turns.map((turn) => (
            <TurnRow key={turn.turn} turn={turn} label={turnLabel(turn)} />
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText color={colors.neutral600} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="semibold" color={highlight ? colors.primary : colors.textPrimary}>
        {value}
      </AppText>
    </View>
  );
}

const TURN_ICONS = {
  paid: { name: 'checkmark-circle', color: colors.success },
  current: { name: 'radio-button-on', color: colors.primary },
  upcoming: { name: 'person-outline', color: colors.neutral500 },
  vacant: { name: 'ellipse-outline', color: colors.neutral500 },
} as const;

function TurnRow({ turn, label }: { turn: CircleTurn; label: string }) {
  const { t } = useTranslation();
  const name = turn.isMe
    ? t('circles.detail.you')
    : (turn.memberName ??
      t(turn.status === 'vacant' ? 'circles.detail.vacant' : 'circles.detail.member'));
  const icon = TURN_ICONS[turn.status];
  return (
    <View style={styles.row} testID={`circle-turn-${turn.turn}`}>
      <Ionicons name={icon.name} size={20} color={icon.color} />
      <AppText weight={turn.isMe ? 'semibold' : 'regular'} style={styles.flex}>
        {t('circles.detail.turnRow', { label, name })}
      </AppText>
      <Badge
        label={t(`circles.detail.turnStatus.${turn.status}`)}
        tone={turn.status === 'paid' ? 'success' : 'subtle'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  hero: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary100,
  },
  progress: { flexDirection: 'row', gap: spacing.xxs, paddingVertical: spacing.xs },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.primary300 },
  segmentDone: { backgroundColor: colors.primary },
  rows: { gap: spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
