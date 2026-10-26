import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/presentation/shared/hooks/useReducedMotion';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';

interface BottomSheetProps {
  visible: boolean;
  title: string;
  /** Se llama al pulsar cerrar, el fondo o el botón atrás de Android. */
  onClose: () => void;
  closeAccessibilityLabel: string;
  children: React.ReactNode;
  testID?: string;
}

/**
 * Hoja inferior del Figma (Choose Duration, Change Language, My Referrals).
 * Sin animación si el sistema tiene activado "reducir movimiento"; respeta el teclado y el Safe Area.
 */
export function BottomSheet({
  visible,
  title,
  onClose,
  closeAccessibilityLabel,
  children,
  testID,
}: BottomSheetProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      testID={testID}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: spacing.l + insets.bottom }]}
        >
          <View style={styles.header}>
            <AppText variant="highlight" weight="semibold" accessibilityRole="header">
              {title}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeAccessibilityLabel}
              onPress={onClose}
              hitSlop={spacing.sm}
              style={styles.close}
            >
              <Ionicons name="close" size={24} color={colors.black} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    gap: spacing.lg,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
