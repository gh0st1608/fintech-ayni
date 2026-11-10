import { Inject, Injectable } from '@nestjs/common';

import { maskEmail, maskName, maskPhone } from '../../../../shared/domain/services/mask-pii';
import { NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import { LoginIdentifier } from '../../domain/value-objects/login-identifier';
import {
  ADMIN_USERS_QUERY,
  type AdminUserDetail,
  type AdminUserLookup,
  type AdminUserRecord,
  type AdminUsersQueryPort,
} from '../ports/admin-users-query.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La persona como la ve el personal: identificada, con sus datos personales enmascarados. */
export type AdminUserView = Omit<AdminUserRecord, 'email' | 'phone' | 'firstName' | 'lastName'> & {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type AdminUserDetailView = AdminUserView & Pick<AdminUserDetail, 'kyc' | 'circles'>;

function mask(record: AdminUserRecord): AdminUserView {
  return {
    userId: record.userId,
    status: record.status,
    preferredLanguage: record.preferredLanguage,
    createdAt: record.createdAt,
    blocked: record.blocked,
    name: maskName(record.firstName, record.lastName),
    email: record.email ? maskEmail(record.email) : null,
    phone: record.phone ? maskPhone(record.phone) : null,
  };
}

/**
 * Interpreta lo que escribió el personal: un id, un email completo o un teléfono con código de
 * país. Solo búsquedas exactas, con el mismo formato que el inicio de sesión.
 */
export function parseLookup(query: string): AdminUserLookup {
  const value = query.trim();
  if (UUID.test(value)) return { by: 'id', value: value.toLowerCase() };
  try {
    if (value.includes('@'))
      return { by: 'email', value: LoginIdentifier.parse(value, 'email').value };
    if (value.startsWith('+')) {
      return {
        by: 'phone',
        value: LoginIdentifier.parse(value.replace(/[\s-]/g, ''), 'phone').value,
      };
    }
  } catch {
    // Formato inválido: el mismo mensaje que cualquier otra búsqueda que no se entiende.
  }
  throw new ValidationError(
    'Busca por email completo, teléfono con código de país (+51…) o id de usuario',
    { query: 'invalid' },
  );
}

/** `GET /admin/v1/users?query=`: búsqueda exacta, con resultados enmascarados. */
@Injectable()
export class SearchAdminUsersUseCase {
  constructor(@Inject(ADMIN_USERS_QUERY) private readonly users: AdminUsersQueryPort) {}

  async execute(query: string): Promise<AdminUserView[]> {
    const found = await this.users.search(parseLookup(query));
    return found.map(mask);
  }
}

/** `GET /admin/v1/users/:userId`: perfil enmascarado, estado del KYC y sus juntas. */
@Injectable()
export class GetAdminUserUseCase {
  constructor(@Inject(ADMIN_USERS_QUERY) private readonly users: AdminUsersQueryPort) {}

  async execute(userId: string): Promise<AdminUserDetailView> {
    const user = await this.users.find(userId);
    if (!user) throw new NotFoundError('No existe esa persona', 'USER_NOT_FOUND');
    return { ...mask(user), kyc: user.kyc, circles: user.circles };
  }
}
