import { Outfit_300Light } from '@expo-google-fonts/outfit/300Light';
import { Outfit_400Regular } from '@expo-google-fonts/outfit/400Regular';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { useFonts } from 'expo-font';

import { fontFamily } from './tokens';

// Solo los pesos que usa el diseño: importar el paquete completo incluiría las 9 variantes.
const FONT_SOURCES = {
  [fontFamily.light]: Outfit_300Light,
  [fontFamily.regular]: Outfit_400Regular,
  [fontFamily.semibold]: Outfit_600SemiBold,
};

/**
 * Carga la tipografía Outfit. Devuelve true cuando terminó (también si falló:
 * en ese caso la app usa la fuente del sistema en lugar de bloquear el arranque).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_SOURCES);
  return loaded || error !== null;
}
