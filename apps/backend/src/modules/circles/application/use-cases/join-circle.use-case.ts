import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../../../shared/errors/app-error';
import { type Circle, type JoinResult } from '../../domain/entities/circle';
import {
  CIRCLE_REPOSITORY,
  type CircleRepositoryPort,
  IdempotencyKeyExistsError,
} from '../ports/circle-repository.port';

export interface JoinCircleCommand {
  circleId: string;
  userId: string;
  position: number;
  idempotencyKey: string;
}

/**
 * Reserva un slot de forma atómica e idempotente (COPAYNI-24, 31).
 * - El círculo valida la solicitud: slot en rango y libre, usuario sin otro slot.
 * - El repositorio inserta con unicidad: si otra solicitud tomó el slot entre la lectura y la
 *   escritura, responde SLOT_TAKEN.
 * - Reintentar con la misma clave devuelve la membresía ya creada, aunque los dos intentos
 *   lleguen a la vez.
 */
@Injectable()
export class JoinCircleUseCase {
  constructor(@Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort) {}

  async execute(command: JoinCircleCommand): Promise<JoinResult> {
    const result = (await this.load(command.circleId)).join(command);
    if (!result.created) return result;

    try {
      await this.circles.addMembership(command.circleId, result.membership);
      return result;
    } catch (error) {
      if (!(error instanceof IdempotencyKeyExistsError)) throw error;
      // Ganó otra solicitud con la misma clave: con el estado actual, join devuelve esa
      // membresía (created: false) o rechaza si la clave se usó con otros datos.
      return (await this.load(command.circleId)).join(command);
    }
  }

  private async load(circleId: string): Promise<Circle> {
    const circle = await this.circles.findById(circleId);
    if (!circle) throw new NotFoundError('No se encontró el círculo', 'CIRCLE_NOT_FOUND');
    return circle;
  }
}
