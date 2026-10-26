import Ionicons from '@expo/vector-icons/Ionicons';
import { I18nManager } from 'react-native';

import { colors } from '@/presentation/theme/tokens';

/** Flecha de avance que se invierte en idiomas RTL. Decorativa: oculta a lectores de pantalla. */
export function Chevron({ color = colors.black }: { color?: string }) {
  return (
    <Ionicons
      name="chevron-forward"
      size={20}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
