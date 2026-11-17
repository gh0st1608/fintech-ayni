/**
 * Contenido de Home (COPAYNI-25): las láminas del carrusel de ofertas y las tarjetas de metas
 * populares. El backend las entrega ya resueltas al idioma, activas y en orden; una sección vacía
 * se oculta.
 */
export const HOME_TARGETS = ['savingsPlans', 'joinCircle', 'referral', 'help', 'none'] as const;
export type HomeTarget = (typeof HOME_TARGETS)[number];

/**
 * Ilustración: una clave del catálogo de la app, no una imagen del servidor (BO4). Mientras UX no
 * entregue las ilustraciones, la app dibuja el icono del design system que le corresponde.
 */
export const HOME_ILLUSTRATIONS = [
  'megaphone',
  'gift',
  'piggyBank',
  'calendar',
  'school',
  'home',
  'travel',
  'celebration',
] as const;
export type HomeIllustration = (typeof HOME_ILLUSTRATIONS)[number];

export const OFFER_BACKGROUNDS = ['cream', 'blush', 'mint', 'lilac'] as const;
export type OfferBackground = (typeof OFFER_BACKGROUNDS)[number];
export const GOAL_BACKGROUNDS = ['primary', 'orange', 'green'] as const;
export type GoalBackground = (typeof GOAL_BACKGROUNDS)[number];

export interface HomeItem {
  id: string;
  title: string;
  subtitle: string | null;
  illustration: HomeIllustration;
  background: string;
  target: HomeTarget;
  /** Monto en unidades menores para precargar el flujo de unión; `null` en el resto. */
  targetAmount: number | null;
}

export interface HomeContent {
  offers: HomeItem[];
  goals: HomeItem[];
}

export const EMPTY_HOME_CONTENT: HomeContent = { offers: [], goals: [] };

/** Una tarjeta sin destino es informativa: no se puede pulsar. */
export const isPressable = (item: HomeItem): boolean => item.target !== 'none';
