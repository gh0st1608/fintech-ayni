import { ConflictError } from '../../../../shared/errors/app-error';
import { type User } from '../../domain/entities/user';

/** El email o teléfono ya lo usa otra cuenta (COPAYNI-45). */
export class ContactTakenError extends ConflictError {
  constructor() {
    super('CONTACT_TAKEN', 'Ese email o teléfono ya está en otra cuenta');
  }
}
import { type LoginIdentifier } from '../../domain/value-objects/login-identifier';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  /**
   * Devuelve el usuario con ese identificador o lo crea pendiente de verificación. Dos inicios
   * simultáneos con el mismo identificador obtienen el mismo usuario (unicidad en la base).
   */
  findOrRegister(identifier: LoginIdentifier): Promise<User>;
  /** Guarda el estado, las preferencias y los datos personales. Rechaza con ContactTakenError. */
  save(user: User): Promise<void>;
  /** El usuario que ya usa ese email o teléfono, o `null`. */
  findByIdentifier(identifier: LoginIdentifier): Promise<User | null>;
}
