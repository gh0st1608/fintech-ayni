import { Image, StyleSheet } from 'react-native';

import SCAN_ID from '@assets/images/documents/scan-id.png';

const SIZE = 80;

/** Icono de escaneo de las guías del Figma (Scan National ID y Upload HR Letter). */
export function ScanGuideIcon() {
  return (
    <Image
      source={SCAN_ID}
      style={styles.icon}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  icon: { width: SIZE, height: SIZE, alignSelf: 'center' },
});
