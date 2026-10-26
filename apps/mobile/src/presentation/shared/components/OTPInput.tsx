import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, fontFamily, radius, spacing, typography } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { FieldError } from './FieldError';

interface OTPInputProps {
  /** Nombre accesible del campo, p. ej. "Código de verificación". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Se llama una vez cuando se completan todos los dígitos. */
  onComplete?: (code: string) => void;
  length?: number;
  error?: string;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * Código OTP del Figma (4 casillas). Un único TextInput oculto recibe el texto, lo que
 * permite pegar el código y el autocompletado desde SMS o email; las casillas solo lo muestran.
 */
export function OTPInput({
  label,
  value,
  onChange,
  onComplete,
  length = 4,
  error,
  editable = true,
  autoFocus = false,
  testID,
}: OTPInputProps) {
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(autoFocus);

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length && value.length < length) onComplete?.(digits);
  }

  return (
    <View style={styles.field}>
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        style={styles.boxes}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length }, (_, index) => {
          const isActive = focused && index === Math.min(value.length, length - 1);
          const borderColor = error
            ? colors.error
            : isActive
              ? colors.primary
              : colors.borderNormal;
          return (
            <View
              key={index}
              style={[styles.box, { borderColor }]}
              testID={testID ? `${testID}-box-${index}` : undefined}
            >
              <AppText variant="title" weight="semibold">
                {value[index] ?? ''}
              </AppText>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        aria-invalid={!!error}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        maxLength={length}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        caretHidden
        style={styles.hiddenInput}
        testID={testID}
      />
      <FieldError message={error} />
    </View>
  );
}

const BOX_SIZE = 52;

const styles = StyleSheet.create({
  field: { gap: spacing.sm, alignItems: 'center' },
  boxes: { flexDirection: 'row', gap: spacing.sm },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  // Accesible y enfocable, pero invisible: las casillas son la representación visual.
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    ...typography.body,
    fontFamily: fontFamily.regular,
  },
});
