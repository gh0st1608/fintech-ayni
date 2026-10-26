import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  BUTTON_HEIGHT,
  colors,
  fontFamily,
  radius,
  spacing,
  typography,
} from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { FieldError } from './FieldError';

const REGIONAL_INDICATOR_A = 0x1f1e6;

/** Bandera emoji a partir del código de región ISO 3166-1 alfa-2 (p. ej. "PE" → 🇵🇪). */
export function flagEmoji(regionCode: string): string {
  const code = regionCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(
    ...[...code].map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - 65),
  );
}

interface PhoneInputProps {
  label: string;
  /** Región ISO 3166-1 alfa-2 del prefijo, p. ej. "PE". */
  regionCode: string;
  /** Prefijo internacional, p. ej. "+51". */
  callingCode: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Abre el selector de país; sin él, el prefijo no es interactivo. */
  onPressCountry?: () => void;
  countryAccessibilityLabel?: string;
  placeholder?: string;
  error?: string;
  editable?: boolean;
  testID?: string;
}

/** Teléfono del Figma: caja de bandera y prefijo, separada del número. */
export function PhoneInput({
  label,
  regionCode,
  callingCode,
  value,
  onChangeText,
  onPressCountry,
  countryAccessibilityLabel,
  placeholder,
  error,
  editable = true,
  testID,
}: PhoneInputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.borderNormal;
  const prefix = `${flagEmoji(regionCode)} ${callingCode}`.trim();

  return (
    <View style={styles.field}>
      <AppText weight="semibold" importantForAccessibility="no">
        {label}
      </AppText>
      <View style={styles.row}>
        <Pressable
          accessibilityRole={onPressCountry ? 'button' : 'text'}
          accessibilityLabel={countryAccessibilityLabel ?? callingCode}
          disabled={!onPressCountry || !editable}
          onPress={onPressCountry}
          style={[styles.box, styles.prefix, { borderColor: colors.borderNormal }]}
        >
          <AppText>{prefix}</AppText>
        </Pressable>
        <View style={[styles.box, styles.number, { borderColor }]}>
          <TextInput
            accessibilityLabel={label}
            aria-invalid={!!error}
            editable={editable}
            value={value}
            onChangeText={(text) => onChangeText(text.replace(/[^\d\s]/g, ''))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder={placeholder}
            placeholderTextColor={colors.secondary300}
            style={styles.input}
            testID={testID}
          />
        </View>
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  prefix: { minWidth: 88, alignItems: 'center' },
  number: { flex: 1 },
  input: {
    ...typography.body,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
});
