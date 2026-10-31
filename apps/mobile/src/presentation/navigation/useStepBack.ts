import { usePreventRemove } from 'expo-router';

/**
 * Flujos de varios pasos en una sola ruta: mientras `active`, la flecha atrás de la cabecera, el
 * botón atrás de Android y el gesto de deslizar llaman a `onBack` (paso anterior) en vez de salir.
 */
export function useStepBack(active: boolean, onBack: () => void): void {
  usePreventRemove(active, onBack);
}
