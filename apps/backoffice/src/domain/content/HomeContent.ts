/**
 * Contenido de Home (COPAYNI-25, BO4 y BO5): las láminas del carrusel de ofertas y las tarjetas
 * de metas populares. Lo que se guarda se publica al instante en la app, sin publicar una versión.
 */
export const CONTENT_LANGUAGES = ['es', 'en'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export const CONTENT_LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  es: 'Español',
  en: 'Inglés',
};

/** Pantallas a las que puede llevar una tarjeta; nunca una URL (BO4). */
export const CONTENT_TARGETS = [
  'savings_plans',
  'join_circle',
  'referral',
  'help',
  'none',
] as const;
export type ContentTarget = (typeof CONTENT_TARGETS)[number];

export const TARGET_LABELS: Record<ContentTarget, string> = {
  savings_plans: 'Planes de ahorro',
  join_circle: 'Unirse a una junta',
  referral: 'Invita a un amigo',
  help: 'Ayuda',
  none: 'Sin destino (informativa)',
};

/** Ilustraciones del catálogo de la app; agregar una exige publicar la app. */
export const ILLUSTRATIONS = [
  'megaphone',
  'gift',
  'piggy-bank',
  'calendar',
  'school',
  'home',
  'travel',
  'celebration',
] as const;
export type Illustration = (typeof ILLUSTRATIONS)[number];

export const ILLUSTRATION_LABELS: Record<Illustration, string> = {
  megaphone: 'Megáfono',
  gift: 'Regalo',
  'piggy-bank': 'Alcancía',
  calendar: 'Calendario',
  school: 'Colegio',
  home: 'Casa',
  travel: 'Viaje',
  celebration: 'Celebración',
};

export const OFFER_BACKGROUNDS = ['cream', 'blush', 'mint', 'lilac'] as const;
export type OfferBackground = (typeof OFFER_BACKGROUNDS)[number];
export const GOAL_BACKGROUNDS = ['primary', 'orange', 'green'] as const;
export type GoalBackground = (typeof GOAL_BACKGROUNDS)[number];

export const BACKGROUND_LABELS: Record<OfferBackground | GoalBackground, string> = {
  cream: 'Crema',
  blush: 'Rosa',
  mint: 'Menta',
  lilac: 'Lila',
  primary: 'Azul',
  orange: 'Naranja',
  green: 'Verde',
};

/** Vista previa de la tarjeta en el back-office. */
export const BACKGROUND_COLORS: Record<OfferBackground | GoalBackground, string> = {
  cream: '#FDF3E3',
  blush: '#FDE8EC',
  mint: '#E3F6F2',
  lilac: '#EDEAFB',
  primary: '#3051BB',
  orange: '#F2922C',
  green: '#22A06B',
};

export interface ContentText {
  title: string;
  subtitle: string | null;
}

export type ContentTexts = Record<ContentLanguage, ContentText>;

export interface ContentItem {
  id: string;
  texts: ContentTexts;
  illustration: Illustration;
  background: string;
  target: ContentTarget;
  /** Unidades menores; solo con `join_circle`. */
  targetAmount: number | null;
  position: number;
  active: boolean;
  /** Solo las ofertas tienen vigencia. */
  startsOn: Date | null;
  endsOn: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface HomeContent {
  offers: ContentItem[];
  goals: ContentItem[];
}

export type ContentKind = 'offer' | 'goal';

export interface ContentInput {
  texts: ContentTexts;
  illustration: Illustration;
  background: string;
  target: ContentTarget;
  targetAmount: number | null;
  position: number;
  active: boolean;
  startsOn: string | null;
  endsOn: string | null;
}

/** Límites del backend, para avisar antes de enviar. */
export const MAX_ITEMS = 10;
export const LIMITS: Record<ContentKind, { title: number; subtitle: number }> = {
  offer: { title: 60, subtitle: 40 },
  goal: { title: 24, subtitle: 32 },
};

export const backgroundsOf = (kind: ContentKind): readonly string[] =>
  kind === 'offer' ? OFFER_BACKGROUNDS : GOAL_BACKGROUNDS;

/**
 * Qué impide guardar. Se valida aquí para explicarlo junto al campo; el backend vuelve a validar,
 * que es donde la regla manda.
 */
export function contentProblem(kind: ContentKind, input: ContentInput): string | null {
  const limits = LIMITS[kind];
  if (!input.texts.es.title.trim()) return 'El título en español es obligatorio.';
  for (const language of CONTENT_LANGUAGES) {
    const text = input.texts[language];
    if (text.title.length > limits.title) {
      return `El título en ${CONTENT_LANGUAGE_LABELS[language].toLowerCase()} no puede pasar de ${limits.title} caracteres.`;
    }
    if ((text.subtitle ?? '').length > limits.subtitle) {
      return `El subtítulo en ${CONTENT_LANGUAGE_LABELS[language].toLowerCase()} no puede pasar de ${limits.subtitle} caracteres.`;
    }
  }
  if (input.targetAmount !== null && input.target !== 'join_circle') {
    return 'El monto solo aplica al destino "Unirse a una junta".';
  }
  if (input.targetAmount !== null && input.targetAmount <= 0) {
    return 'El monto debe ser mayor que cero.';
  }
  if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
    return 'La vigencia termina antes de empezar.';
  }
  return null;
}
