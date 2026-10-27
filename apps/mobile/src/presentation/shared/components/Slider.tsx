import { useState } from 'react';
import {
  I18nManager,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius } from '@/presentation/theme/tokens';

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

interface SliderProps extends SliderRange {
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Valor legible que anuncia el lector de pantalla (p. ej. el monto formateado). */
  formatValue: (value: number) => string;
  disabled?: boolean;
  testID?: string;
}

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;

/** Ajusta un valor al salto más cercano dentro del rango. */
export function snapToStep(value: number, { min, max, step }: SliderRange): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(Math.max(snapped, min), max);
}

/** Valor que corresponde a una posición horizontal sobre la pista (de 0 a `width`). */
export function valueFromPosition(x: number, width: number, range: SliderRange): number {
  if (width <= 0) return range.min;
  const ratio = Math.min(Math.max(x / width, 0), 1);
  return snapToStep(range.min + ratio * (range.max - range.min), range);
}

/**
 * Slider del flujo de unión (Payout Amount). Se arrastra o se toca la pista; con lector de
 * pantalla es "adjustable" y sube o baja de a un salto.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  formatValue,
  disabled = false,
  testID,
}: SliderProps) {
  const [width, setWidth] = useState(0);
  const range = { min, max, step };

  // Las vistas hijas no reciben toques: locationX siempre es relativo a la pista completa.
  const onTouch = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX;
    const next = valueFromPosition(I18nManager.isRTL ? width - x : x, width, range);
    if (next !== value) onChange(next);
  };

  const span = max - min;
  const ratio = span > 0 ? (Math.min(Math.max(value, min), max) - min) / span : 0;
  const thumbOffset = ratio * width - THUMB_SIZE / 2;

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    if (disabled) return;
    const delta = nativeEvent.actionName === 'increment' ? step : -step;
    const next = snapToStep(value + delta, range);
    if (next !== value) onChange(next);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.container, disabled && styles.disabled]}
      testID={testID}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View style={[styles.thumb, { start: thumbOffset }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: MIN_TOUCH_TARGET, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.secondary200,
    overflow: 'hidden',
  },
  fill: { height: TRACK_HEIGHT, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
});
