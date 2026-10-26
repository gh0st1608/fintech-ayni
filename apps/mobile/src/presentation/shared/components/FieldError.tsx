import { colors } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

/** Error de un campo, anunciado por los lectores de pantalla en cuanto aparece. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <AppText
      variant="caption"
      color={colors.error}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {message}
    </AppText>
  );
}
