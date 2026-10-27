import { type JoinConfig } from '../../domain/entities/join-config';

export const JOIN_CONFIG_REPOSITORY = Symbol('JOIN_CONFIG_REPOSITORY');

export interface JoinConfigRepositoryPort {
  /** Configuración de unión que aplica al usuario (incluye su límite de payout, si lo hay). */
  getForUser(userId: string): Promise<JoinConfig>;
}
