export const CIRCLE_TERMS = Symbol('CIRCLE_TERMS');

/**
 * Términos del círculo vigentes (COPAYNI-86). La app muestra esta versión en la confirmación y la
 * devuelve al unirse; la unión guarda la versión aceptada y la fecha, para auditoría.
 */
export interface CircleTermsSettings {
  version: string;
}
