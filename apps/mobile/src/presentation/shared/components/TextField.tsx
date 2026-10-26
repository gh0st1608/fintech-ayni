import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Mensaje de error del campo; cambia el borde y se anuncia como alerta. */
  error?: string;
  icon?: IconName;
  ref?: Ref<React.ComponentRef<typeof TextInput>>;
}

/** Campo de texto del Figma: etiqueta encima, icono opcional, borde de foco y error. */
export function TextField({
  label,
  error,
  icon,
  editable = true,
  onFocus,
  onBlur,
  ref,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.borderNormal;

  return (
    <View style={styles.field}>
      <AppText weight="semibold" importantForAccessibility="no">
        {label}
      </AppText>
      <View style={[styles.box, { borderColor }, !editable && styles.readOnly]}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={colors.neutral700}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          aria-invalid={!!error}
          editable={editable}
          placeholderTextColor={colors.secondary300}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={styles.input}
          {...inputProps}
        />
      </View>
      <FieldError message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  box: {
    minHeight: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  readOnly: { backgroundColor: colors.secondary100 },
  input: {
    flex: 1,
    ...typography.body,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
});
