import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { StartDecision, StartProposal } from '@/domain/circles/StartProposal';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { colors, spacing } from '@/presentation/theme/tokens';

import { myCirclesQueryKey } from '../useMyCircles';

const START_PROPOSALS_KEY = ['circles', 'start-proposals'] as const;

/**
 * Círculos que no se llenaron y esperan la respuesta del usuario (COPAYNI-62). Sin diseño en el
 * Figma: se armó con los componentes existentes.
 */
export function StartProposals() {
  const { circles } = useContainer();
  const proposals = useQuery({
    queryKey: START_PROPOSALS_KEY,
    queryFn: ({ signal }) => circles.listStartProposals.execute(signal),
  });
  if (!proposals.data?.length) return null;
  return (
    <View style={styles.list}>
      {proposals.data.map((proposal) => (
        <StartProposalCard key={proposal.circleId} proposal={proposal} />
      ))}
    </View>
  );
}

function StartProposalCard({ proposal }: { proposal: StartProposal }) {
  const { t } = useTranslation();
  const { circles } = useContainer();
  const queryClient = useQueryClient();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const respond = useMutation({
    mutationFn: (decision: StartDecision) =>
      circles.respondStartProposal.execute(proposal.circleId, decision),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: START_PROPOSALS_KEY }),
        queryClient.invalidateQueries({ queryKey: myCirclesQueryKey('active') }),
      ]),
  });
  const { current, proposed, decision } = proposal;

  const rows = [
    [t('circles.startProposal.pot'), formatMoney(proposed.payout, { trimZeroDecimals: true })],
    [t('circles.startProposal.members'), String(proposed.months)],
    [t('circles.startProposal.turn'), String(proposal.position)],
    [t('circles.startProposal.installment'), formatMoney(proposal.firstInstallment)],
    [t('circles.startProposal.receive'), formatMoney(proposal.netPayout)],
  ];

  return (
    <Card style={styles.card} testID={`start-proposal-${proposal.circleId}`}>
      <AppText weight="semibold" accessibilityRole="header">
        {t('circles.startProposal.title')}
      </AppText>
      <AppText variant="caption" color={colors.neutral500}>
        {t('circles.startProposal.description', {
          pot: formatMoney(current.payout, { trimZeroDecimals: true }),
          count: current.months,
        })}
      </AppText>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <AppText variant="caption">{label}</AppText>
          <AppText weight="semibold">{value}</AppText>
        </View>
      ))}
      <AppText variant="caption" color={colors.neutral500}>
        {t('circles.startProposal.respondBy', {
          // Al mediodía local: `YYYY-MM-DD` solo se leería en UTC, un día antes en Lima.
          date: formatDate(`${proposal.respondBy}T12:00:00`, 'date'),
        })}
      </AppText>
      {decision && (
        <AppText weight="semibold" testID="start-proposal-decision">
          {t(`circles.startProposal.decision.${decision}`)}
        </AppText>
      )}
      {respond.isError && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {errorMessage(t, respond.error)}
        </AppText>
      )}
      <View style={styles.actions}>
        <Button
          label={t('circles.startProposal.accept')}
          disabled={decision === 'accepted'}
          loading={respond.isPending && respond.variables === 'accepted'}
          onPress={() => respond.mutate('accepted')}
        />
        <Button
          label={t('circles.startProposal.withdraw')}
          variant="secondary"
          disabled={decision === 'withdrawn'}
          loading={respond.isPending && respond.variables === 'withdrawn'}
          onPress={() => respond.mutate('withdrawn')}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, marginBottom: spacing.m },
  card: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
});
