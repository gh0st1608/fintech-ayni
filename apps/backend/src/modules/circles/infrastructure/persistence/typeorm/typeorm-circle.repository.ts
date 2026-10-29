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
  InvalidCursorError,
  type JoinableCircleCriteria,
  type MembershipPage,
  type MembershipsQuery,
  type OpenCirclesCriteria,
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
import { fromStoredPrice, type StoredSlotPrice, toStoredPrice } from './slot-price.mapper';

/** Cada índice único de circle_memberships corresponde a un error del puerto. */
const UNIQUE_CONSTRAINT_ERRORS: Record<string, () => Error> = {
  uq_circle_memberships_position: () => new SlotTakenError(),
  uq_circle_memberships_user: () => new AlreadyMemberError(),
  uq_circle_memberships_idempotency_key: () => new IdempotencyKeyExistsError(),
  uq_circle_memberships_user_idempotency_key: () => new IdempotencyKeyExistsError(),
};

const toStartsOn = (period: Period): string => `${period.toString()}-01`;

interface MemberCircleRow {
  membership_id: string;
  /** `created_at::text`: conserva los microsegundos, que un Date de JS perdería en el cursor. */
  joined_at: string;
  position: number;
  price: StoredSlotPrice | null;
  circle_id: string;
  payout_amount: string;
  currency: string;
  months: number;
  starts_on: string;
}

interface Keyset {
  joinedAt: string;
  membershipId: string;
}

const TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

/** Cursor opaco para el cliente: la posición (fecha de unión, id) de la última membresía. */
const encodeCursor = (keyset: Keyset): string =>
  Buffer.from(JSON.stringify([keyset.joinedAt, keyset.membershipId])).toString('base64url');

function decodeCursor(cursor: string): Keyset {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [joinedAt, membershipId] = parsed as unknown[];
      if (
        typeof joinedAt === 'string' &&
        TIMESTAMPTZ.test(joinedAt) &&
        typeof membershipId === 'string' &&
        isUuid(membershipId)
      ) {
        return { joinedAt, membershipId };
      }
    }
  } catch {
    // Cae al error de abajo: un cursor que no es JSON no lo generó este repositorio.
  }
  throw new InvalidCursorError();
}
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

  async listMemberships(query: MembershipsQuery): Promise<MembershipPage> {
    const { userId, status, limit } = query;
    const after = query.cursor === null ? null : decodeCursor(query.cursor);
    if (!isUuid(userId)) return { items: [], nextCursor: null };

    const params: unknown[] = [userId, limit + 1];
    let keyset = '';
    if (after) {
      params.push(after.joinedAt, after.membershipId);
      keyset = 'AND (m.created_at, m.id) < ($3::timestamptz, $4::uuid)';
    }
    const rows = await this.memberships.query<MemberCircleRow[]>(
      `SELECT m.id AS membership_id, m.created_at::text AS joined_at, m.position, m.price,
              c.id AS circle_id, c.payout_amount::text AS payout_amount, c.currency, c.months,
              to_char(c.starts_on, 'YYYY-MM') AS starts_on
         FROM circle_memberships m
         JOIN circles c ON c.id = m.circle_id
        WHERE m.user_id = $1 AND c.cycle_state ${status === 'finished' ? '=' : '<>'} 'finished'
              ${keyset}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2`,
      params,
    );

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        circleId: row.circle_id,
        terms: CircleTerms.create({
          payout: Money.of(Number(row.payout_amount), row.currency),
          months: row.months,
          startsOn: Period.parse(row.starts_on),
        }),
        position: row.position,
        ...(row.price && { price: fromStoredPrice(row.price) }),
        joinedAt: new Date(row.joined_at),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ joinedAt: last.joined_at, membershipId: last.membership_id })
          : null,
    };
  }

  async findByMembershipKey(userId: string, idempotencyKey: string): Promise<Circle | null> {
    if (!isUuid(userId)) return null;
    const row = await this.memberships.findOne({
      select: { circleId: true },
      where: { userId, idempotencyKey },
    });
    return row ? this.findById(row.circleId) : null;
  }

  async findOldestJoinable(criteria: JoinableCircleCriteria): Promise<Circle | null> {
    const { payout, months, startsAfter, userId } = criteria;
    const row = await this.joinable(startsAfter, userId)
      .andWhere('circle.payout_amount = :amount AND circle.currency = :currency', {
        amount: payout.amount,
        currency: payout.currency,
      })
      .andWhere('circle.months = :months', { months })
      .limit(1)
      .getRawOne<{ id: string }>();
    return row ? this.findById(row.id) : null;
  }

  async listJoinable(criteria: OpenCirclesCriteria): Promise<Circle[]> {
    const rows = await this.joinable(criteria.startsAfter, criteria.userId)
      .limit(criteria.limit)
      .getRawMany<{ id: string }>();
    const circles = await Promise.all(rows.map(({ id }) => this.findById(id)));
    return circles.filter((circle): circle is Circle => circle !== null);
  }

  /** Círculos que no empezaron, no están llenos y no tienen al usuario, del más antiguo al más nuevo. */
  private joinable(startsAfter: Period, userId: string) {
    return (
      this.circles
        .createQueryBuilder('circle')
        .select('circle.id', 'id')
        // Empieza después del mes actual: el primer día del mes siguiente o más tarde.
        .where('circle.starts_on >= :firstAllowed', {
          firstAllowed: toStartsOn(startsAfter.addMonths(1)),
        })
        .andWhere(
          '(SELECT count(*) FROM circle_memberships m WHERE m.circle_id = circle.id) < circle.months',
        )
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM circle_memberships m WHERE m.circle_id = circle.id AND m.user_id::text = :userId)',
          { userId },
        )
        .orderBy('circle.created_at', 'ASC')
        .addOrderBy('circle.id', 'ASC')
    );
  }

  async create(circle: Circle): Promise<void> {
    try {
      await this.insertCircle(circle);
    } catch (error) {
      // El círculo es nuevo: solo puede chocar con otra membresía del usuario con la misma clave.
      if (
        violatedConstraint(error, PG_UNIQUE_VIOLATION) ===
        'uq_circle_memberships_user_idempotency_key'
      ) {
        throw new IdempotencyKeyExistsError();
      }
      throw error;
    }
  }

  private async insertCircle(circle: Circle): Promise<void> {
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
          userId: membership.userId,
          idempotencyKey: membership.idempotencyKey,
        });
        throw sameKey ? new IdempotencyKeyExistsError() : mapped();
      }
      // Nombre que PostgreSQL da a la clave foránea de la migración CreateCircles.
      if (
        violatedConstraint(error, PG_FOREIGN_KEY_VIOLATION) === 'circle_memberships_circle_id_fkey'
      ) {
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
      price: membership.price ? toStoredPrice(membership.price) : null,
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
      memberships: (row.memberships ?? []).map(({ userId, position, idempotencyKey, price }) => ({
        userId,
        position,
        idempotencyKey,
        ...(price && { price: fromStoredPrice(price) }),
      })),
    });
  }
}
