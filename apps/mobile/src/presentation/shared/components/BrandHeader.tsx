import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Wordmark } from '@/presentation/shared/components/Wordmark';
import { spacing } from '@/presentation/theme/tokens';

interface BrandHeaderProps {
  /** Acciones a la derecha (la racha D11 y la campana D6 cuando existan). */
  actions?: ReactNode;
}

/** Cabecera de Home con la marca (Figma Home 55:8637, marca D15). */
export function BrandHeader({ actions }: BrandHeaderProps) {
  return (
    <View style={styles.header} testID="brand-header">
      <Wordmark />
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
});
