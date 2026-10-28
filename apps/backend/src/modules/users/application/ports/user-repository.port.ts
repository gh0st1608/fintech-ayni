import { type User } from '../../domain/entities/user';
import { type LoginIdentifier } from '../../domain/value-objects/login-identifier';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  /**
   * Devuelve el usuario con ese identificador o lo crea pendiente de verificación. Dos inicios
   * simultáneos con el mismo identificador obtienen el mismo usuario (unicidad en la base).
   */
  findOrRegister(identifier: LoginIdentifier): Promise<User>;
  /** Guarda el estado y las preferencias. */
  save(user: User): Promise<void>;
}
