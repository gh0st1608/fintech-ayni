/** Roles del personal; los mismos que valida el backend (`STAFF_ROLES`). */
export const STAFF_ROLES = ['support', 'operations', 'finance', 'admin', 'super_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffMember {
  staffId: string;
  email: string | null;
  roles: readonly StaffRole[];
  /** Última autenticación real: las acciones críticas la exigen reciente (step-up). */
  authenticatedAt: Date;
}

/**
 * Acciones del back-office y quién puede hacerlas (matriz de docs/backoffice-plan.md §5). La UI la
 * usa para no ofrecer lo que el backend va a rechazar; la autorización real es la del backend.
 */
export const PERMISSIONS = {
  'circles.read': ['support', 'operations', 'finance', 'super_admin'],
  'circles.pause': ['super_admin'],
  'kyc.review': ['operations', 'super_admin'],
  'users.read': ['support', 'operations', 'finance', 'super_admin'],
  'finance.read': ['finance', 'super_admin'],
  /** Proponer y decidir movimientos del fondo; nunca la misma persona (COPAYNI-73). */
  'finance.operate': ['finance', 'super_admin'],
  /** La mora la siguen finanzas y operaciones (COPAYNI-94). */
  'delinquency.read': ['finance', 'operations', 'super_admin'],
  'users.support': ['support', 'operations', 'super_admin'],
  'users.reveal': ['operations', 'super_admin'],
  'payouts.read': ['support', 'operations', 'finance', 'super_admin'],
  'payouts.register': ['operations', 'super_admin'],
  /** Ayuda y política de pagos de la app (COPAYNI-83). */
  'help.read': ['support', 'operations', 'super_admin'],
  'help.edit': ['operations', 'super_admin'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(staff: Pick<StaffMember, 'roles'>, permission: Permission): boolean {
  const allowed: readonly StaffRole[] = PERMISSIONS[permission];
  return staff.roles.some((role) => allowed.includes(role));
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  support: 'Soporte',
  operations: 'Operaciones',
  finance: 'Finanzas',
  admin: 'Administración del personal',
  super_admin: 'Admin general',
};
