import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/presentation/theme/tokens';

/** Radio superior de la hoja de autenticación (radius-xxxl-12 del Figma). */
const SHEET_RADIUS = 36;

/**
 * Hoja blanca sobre fondo negro de Signin y Verify OTP (55:10724, 55:10749).
 * Respeta el teclado y el Safe Area; el contenido hace scroll en pantallas pequeñas.
 */
export function AuthSheet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.topInset} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheet}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={styles.bottomInset} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  topInset: { paddingBottom: spacing.lg },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingTop: 60,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
  },
  bottomInset: { backgroundColor: colors.surface },
});
