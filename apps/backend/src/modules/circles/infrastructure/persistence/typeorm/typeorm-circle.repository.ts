import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { Period } from '../../../../../shared/domain/value-objects/period';
import { NotFoundError } from '../../../../../shared/errors/app-error';
import {
  isUuid,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '../../../../../shared/infrastructure/persistence/postgres-errors';
import {
  type CircleRepositoryPort,
  IdempotencyKeyExistsError,
} from '../../../application/ports/circle-repository.port';
import {
  AlreadyMemberError,
  Circle,
  type Membership,
  SlotTakenError,
} from '../../../domain/entities/circle';
import { CircleTerms } from '../../../domain/value-objects/circle-terms';
import { CircleMembershipEntity } from './circle-membership.entity';
import { CircleEntity } from './circle.entity';

/** Cada índice único de circle_memberships corresponde a un error del puerto. */
const UNIQUE_CONSTRAINT_ERRORS: Record<string, () => Error> = {
  uq_circle_memberships_position: () => new SlotTakenError(),
  uq_circle_memberships_user: () => new AlreadyMemberError(),
  uq_circle_memberships_idempotency_key: () => new IdempotencyKeyExistsError(),
};

const toStartsOn = (period: Period): string => `${period.toString()}-01`;
const toPeriod = (startsOn: string): Period => Period.parse(startsOn.slice(0, 7));

/** CircleRepositoryPort sobre PostgreSQL. Las entidades no salen de este adaptador. */
@Injectable()
export class TypeOrmCircleRepository implements CircleRepositoryPort {
  constructor(
    @InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>,
    @InjectRepository(CircleMembershipEntity)
    private readonly memberships: Repository<CircleMembershipEntity>,
  ) {}

  async findById(id: string): Promise<Circle | null> {
    if (!isUuid(id)) return null;
    const row = await this.circles.findOne({ where: { id }, relations: { memberships: true } });
    return row ? TypeOrmCircleRepository.toDomain(row) : null;
  }

  /** Guarda un círculo nuevo con sus membresías (alta de círculos y datos de prueba). */
  async create(circle: Circle): Promise<void> {
    await this.circles.manager.transaction(async (manager) => {
      await manager.insert(CircleEntity, {
        id: circle.id,
        payoutAmount: circle.terms.payout.amount,
        currency: circle.terms.currency,
        months: circle.terms.months,
        startsOn: toStartsOn(circle.terms.startsOn),
      });
      if (circle.memberships.length > 0) {
        await manager.insert(
          CircleMembershipEntity,
          circle.memberships.map((membership) => this.toRow(circle.id, membership)),
        );
      }
    });
  }

  async addMembership(circleId: string, membership: Membership): Promise<void> {
    try {
      await this.memberships.insert(this.toRow(circleId, membership));
    } catch (error) {
      const unique = violatedConstraint(error, PG_UNIQUE_VIOLATION);
      const mapped = unique === undefined ? undefined : UNIQUE_CONSTRAINT_ERRORS[unique];
      if (mapped) {
        // Si el mismo pedido llega dos veces a la vez, PostgreSQL puede reportar primero el
        // índice del slot o del usuario: la clave ya guardada indica que es un reintento.
        const sameKey = await this.memberships.existsBy({
          circleId,
          idempotencyKey: membership.idempotencyKey,
        });
        throw sameKey ? new IdempotencyKeyExistsError() : mapped();
      }
      if (violatedConstraint(error, PG_FOREIGN_KEY_VIOLATION) !== undefined) {
        throw new NotFoundError('No se encontró el círculo', 'CIRCLE_NOT_FOUND');
      }
      throw error;
    }
  }

  private toRow(circleId: string, membership: Membership): CircleMembershipEntity {
    return Object.assign(new CircleMembershipEntity(), {
      id: randomUUID(),
      circleId,
      userId: membership.userId,
      position: membership.position,
      idempotencyKey: membership.idempotencyKey,
    });
  }

  static toDomain(row: CircleEntity): Circle {
    return Circle.restore({
      id: row.id,
      terms: CircleTerms.create({
        payout: Money.of(row.payoutAmount, row.currency),
        months: row.months,
        startsOn: toPeriod(row.startsOn),
      }),
      memberships: (row.memberships ?? []).map(({ userId, position, idempotencyKey }) => ({
        userId,
        position,
        idempotencyKey,
      })),
    });
  }
}
