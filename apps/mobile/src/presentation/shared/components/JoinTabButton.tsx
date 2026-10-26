import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/presentation/theme/tokens';

const SIZE = 64;

interface JoinTabButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
}

/** Botón central elevado del tab bar ("+" del Figma). Abre el flujo de unión en vez de una pestaña. */
export function JoinTabButton({ accessibilityLabel, onPress }: JoinTabButtonProps) {
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        testID="join-tab-button"
      >
        <Ionicons name="add-circle-outline" size={32} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: 'center' },
  button: {
    width: SIZE,
    height: SIZE,
    marginTop: -SIZE / 3,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.85 },
});
