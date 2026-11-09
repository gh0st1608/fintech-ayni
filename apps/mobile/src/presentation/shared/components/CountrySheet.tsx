import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { COUNTRIES, type Country } from '@/domain/auth/countries';
import { useContainer } from '@/presentation/providers/ContainerProvider';

import { BottomSheet } from './BottomSheet';
import { flagEmoji } from './PhoneInput';
import { RadioCard, RadioGroup } from './RadioCard';

interface CountrySheetProps {
  visible: boolean;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
}

/** Selector del país del teléfono (pending-scope D14): elegir cierra la hoja. */
export function CountrySheet({ visible, selected, onSelect, onClose }: CountrySheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      visible={visible}
      title={t('countryPicker.title')}
      closeAccessibilityLabel={t('countryPicker.close')}
      onClose={onClose}
      testID="country-sheet"
    >
      <ScrollView style={styles.list}>
        <RadioGroup label={t('countryPicker.title')}>
          {COUNTRIES.map((country) => (
            <RadioCard
              key={country.regionCode}
              title={`${flagEmoji(country.regionCode)} ${t(`countries.${country.regionCode}`)}`}
              description={country.callingCode}
              selected={selected.regionCode === country.regionCode}
              onSelect={() => {
                onSelect(country);
                onClose();
              }}
              plain
              testID={`country-option-${country.regionCode}`}
            />
          ))}
        </RadioGroup>
      </ScrollView>
    </BottomSheet>
  );
}

/** País del teléfono, inicializado con la región del dispositivo (o Perú). */
export function useCountry(): [Country, (country: Country) => void] {
  const { i18n } = useContainer();
  const [country, setCountry] = useState<Country>(() => i18n.resolveCountry.execute());
  return [country, setCountry];
}

const styles = StyleSheet.create({
  list: { maxHeight: 420 },
});
