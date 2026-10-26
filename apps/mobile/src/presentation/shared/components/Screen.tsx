import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/presentation/theme/tokens';

interface ScreenProps extends ViewProps {
  edges?: Edge[];
}

/** Contenedor de pantalla con safe areas y padding estándar. */
export function Screen({ edges = ['top'], style, children, ...rest }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.safeArea}>
      <View style={[styles.content, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.l },
});
