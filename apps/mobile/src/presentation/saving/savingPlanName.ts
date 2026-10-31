import type { TFunction } from 'i18next';

/** Planes con nombre en los JSON de idioma: el backend envía la clave (R12). */
const PLAN_IDS = ['lite', 'bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
type PlanId = (typeof PLAN_IDS)[number];

const isKnownPlan = (id: string): id is PlanId => (PLAN_IDS as readonly string[]).includes(id);

/** Un plan nuevo del backend sin traducción todavía se muestra con su clave. */
export function savingPlanName(t: TFunction, id: string): string {
  return isKnownPlan(id) ? t(`saving.plans.${id}`) : id;
}
