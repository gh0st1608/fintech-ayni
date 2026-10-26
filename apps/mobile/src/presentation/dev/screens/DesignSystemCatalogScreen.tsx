import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { CircleCard } from '@/presentation/shared/components/CircleCard';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { ListItem } from '@/presentation/shared/components/ListItem';
import { OTPInput } from '@/presentation/shared/components/OTPInput';
import { PhoneInput } from '@/presentation/shared/components/PhoneInput';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { TextField } from '@/presentation/shared/components/TextField';
import { Toggle } from '@/presentation/shared/components/Toggle';
import { colors, spacing } from '@/presentation/theme/tokens';

import { CATALOG_SAMPLES as S } from '../catalogSamples';

const noop = () => {};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** Props comunes de los CircleCard de ejemplo, con montos y fechas formateados en el idioma activo. */
function useCircleSample() {
  const { defaultCurrency } = useContainer().config;
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();

  return useMemo(() => {
    const money = (major: number) =>
      formatMoney(Money.fromMajor(major, defaultCurrency), { trimZeroDecimals: true });
    return {
      totalAmount: money(S.circle.total),
      installmentAmount: money(S.circle.installment),
      feesAmount: money(S.circle.fees),
      startLabel: formatDate(S.circle.start, 'monthYear'),
      endLabel: formatDate(S.circle.end, 'monthYear'),
      installmentPeriod: S.circle.installmentPeriod,
      durationLabel: S.circle.durationLabel,
      feesLabel: S.circle.feesLabel,
      turnLabel: S.circle.turnLabel,
      months: 12,
      turnIndex: 2,
    };
  }, [defaultCurrency, formatMoney, formatDate]);
}

/** Catálogo visual del design system para revisar con UX. Solo existe en el ambiente dev. */
export function DesignSystemCatalogScreen() {
  const [tab, setTab] = useState<'active' | 'finished'>('active');
  const [toggle, setToggle] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState<'wallet' | 'bank'>('wallet');
  const [sheetOpen, setSheetOpen] = useState(false);
  const circle = useCircleSample();

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title={S.sections.typography}>
          <AppText variant="display" weight="semibold">
            {S.text.display}
          </AppText>
          <AppText variant="title" weight="semibold">
            {S.text.title}
          </AppText>
          <AppText variant="highlight">{S.text.highlight}</AppText>
          <AppText>{S.text.body}</AppText>
          <AppText variant="caption" weight="light">
            {S.text.caption}
          </AppText>
          <AppText variant="footnote">{S.text.footnote}</AppText>
        </Section>

        <Section title={S.sections.buttons}>
          <Button label={S.buttons.primary} onPress={noop} />
          <Button label={S.buttons.secondary} variant="secondary" onPress={noop} />
          <Button label={S.buttons.disabled} disabled onPress={noop} />
          <Button label={S.buttons.primary} loading onPress={noop} />
        </Section>

        <Section title={S.sections.badges}>
          <View style={styles.row}>
            <Badge label={S.badges.primary} />
            <Badge label={S.badges.success} tone="success" />
            <Badge label={S.badges.subtle} tone="subtle" />
          </View>
        </Section>

        <Section title={S.sections.cards}>
          <Card onPress={noop} accessibilityLabel={S.card.title} selected>
            <AppText weight="semibold">{S.card.title}</AppText>
            <AppText variant="caption" color={colors.success}>
              {S.card.description}
            </AppText>
          </Card>
          <ListItem
            title={S.listItem.title}
            description={S.listItem.description}
            icon="card-outline"
            onPress={noop}
          />
        </Section>

        <Section title={S.sections.controls}>
          <SegmentedTabs options={S.tabs} selectedKey={tab} onChange={setTab} />
          <Toggle
            label={S.toggle.label}
            description={S.toggle.description}
            value={toggle}
            onValueChange={setToggle}
          />
          <Stepper current={2} total={4} accessibilityLabel={S.stepper.label} />
        </Section>

        <Section title={S.sections.feedback}>
          <InfoBanner
            message={S.infoBanner.message}
            link={{ label: S.infoBanner.link, onPress: noop }}
          />
          <EmptyState
            title={S.emptyState.title}
            description={S.emptyState.description}
            action={{ label: S.emptyState.action, onPress: noop }}
          />
        </Section>

        <Section title={S.sections.forms}>
          <TextField
            label={S.textField.label}
            placeholder={S.textField.placeholder}
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
          />
          <TextField label={S.textField.label} value={email} error={S.textField.error} />
          <PhoneInput
            label={S.phone.label}
            regionCode={S.phone.regionCode}
            callingCode={S.phone.callingCode}
            value={phone}
            onChangeText={setPhone}
          />
          <OTPInput label={S.otp.label} value={otp} onChange={setOtp} />
          <RadioGroup label={S.radios.group}>
            <RadioCard
              title={S.radios.wallet.title}
              description={S.radios.wallet.description}
              icon="wallet-outline"
              selected={method === 'wallet'}
              onSelect={() => setMethod('wallet')}
            />
            <RadioCard
              title={S.radios.bank.title}
              description={S.radios.bank.description}
              badge={S.radios.bank.badge}
              icon="business-outline"
              selected={method === 'bank'}
              onSelect={() => setMethod('bank')}
            />
            <RadioCard
              title={S.radios.unavailable.title}
              description={S.radios.unavailable.description}
              selected={false}
              onSelect={noop}
              disabled
              disabledReason={S.radios.unavailable.reason}
            />
          </RadioGroup>
        </Section>

        <Section title={S.sections.circle}>
          <CircleCard {...circle} action={{ label: S.circle.action, onPress: noop }} />
          <CircleCard {...circle} badge={S.circle.badge} />
        </Section>

        <Section title={S.sections.sheet}>
          <Button label={S.sheet.open} variant="secondary" onPress={() => setSheetOpen(true)} />
          <BottomSheet
            visible={sheetOpen}
            title={S.sheet.title}
            closeAccessibilityLabel={S.sheet.close}
            onClose={() => setSheetOpen(false)}
          >
            <AppText>{S.sheet.body}</AppText>
            <Button label={S.buttons.primary} onPress={() => setSheetOpen(false)} />
          </BottomSheet>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.l, gap: spacing.xl },
  section: { gap: spacing.m },
  row: { flexDirection: 'row', gap: spacing.sm },
});
