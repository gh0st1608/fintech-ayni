/**
 * Datos personales enmascarados por defecto en el back-office (docs/backoffice-plan.md §4, Ley
 * 29733). Revelar el dato completo es otra acción, con motivo y auditoría.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** Conserva el prefijo del país y los 3 últimos dígitos: `+51******321`. */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}`;
}

/** Nombre y la inicial del apellido: `Juana P.`. */
export function maskName(firstName: string | null, lastName: string | null): string | null {
  if (!firstName && !lastName) return null;
  const initial = lastName ? `${lastName.trim()[0]}.` : '';
  return [firstName?.trim(), initial].filter(Boolean).join(' ');
}
