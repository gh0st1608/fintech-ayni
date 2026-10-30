import type { Money } from '@/domain/shared/value-objects/Money';

/** Perfil del usuario (GET /v1/me, COPAYNI-44 y 45). */
export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  /** `null` si no cargó nombre ni apellido. */
  fullName: string | null;
  preferredLanguage: string | null;
  /** Límite mensual de pay-in; `null` si no se le restringe (R5). */
  monthlyPayInLimit: Money | null;
}

export const PERSON_NAME_MAX_LENGTH = 80;

/** Mismas reglas que el backend: de 1 a 80 caracteres, sin caracteres de control ni `<` `>`. */
export function isValidPersonName(raw: string): boolean {
  const name = raw.trim();
  return (
    name.length >= 1 &&
    name.length <= PERSON_NAME_MAX_LENGTH &&
    !/[\u0000-\u001f\u007f<>]/.test(name)
  );
}

/** Iniciales para el avatar, a falta de foto (pregunta abierta de COPAYNI-44). */
export function initialsOf(profile: Pick<UserProfile, 'firstName' | 'lastName' | 'email'>): string {
  const letters = [profile.firstName, profile.lastName]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('');
  return (letters || profile.email?.charAt(0) || '?').toUpperCase();
}
