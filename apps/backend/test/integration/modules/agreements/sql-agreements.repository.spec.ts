import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { ReleaseUnsignedMembershipsUseCase } from '@src/modules/circles/application/use-cases/release-unsigned-memberships.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { SqlAgreementsRepository } from '@src/modules/agreements/infrastructure/sql-agreements.repository';
import { MembershipAgreementsAdapter } from '@src/modules/agreements/infrastructure/membership-agreements.adapter';
import {
  ExpireAgreementsUseCase,
  OpenAgreementsUseCase,
} from '@src/modules/agreements/application/agreements.use-cases';
import { hashOf, renderAgreement } from '@src/modules/agreements/domain/templates';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { TEST_PRICING } from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const at = (iso: string) => new Date(iso);
const JOINED = at('2026-11-16T12:00:00Z');
/** 48 h y un segundo después de la unión: el plazo de firma venció. */
const AFTER_TTL = at('2026-11-18T12:00:01Z');

const DATA = {
  payout: pen(6_000),
  months: 10,
  position: 3,
  baseInstallment: pen(600),
  totalPaid: pen(6_000),
  retention: pen(1_200),
  startsOn: '2026-12',
  payoutPeriod: '2027-02',
};

describe('Acuerdos de firma sobre PostgreSQL (COPAYNI-89)', () => {
  let dataSource: DataSource;
  let agreements: SqlAgreementsRepository;
  let circles: TypeOrmCircleRepository;
  let clock: TestClock;

  beforeAll(async () => {
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    agreements = new SqlAgreementsRepository(dataSource);
    circles = new TypeOrmCircleRepository(
      dataSource.getRepository(CircleEntity),
      dataSource.getRepository(CircleMembershipEntity),
    );
  });

  afterAll(() => dataSource.destroy());

  beforeEach(() => {
    clock = new TestClock(JOINED);
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  /** Un círculo sin empezar con un miembro en el turno 3 y su acuerdo pendiente de firma. */
  async function joined(): Promise<{ userId: string; circleId: string; agreementId: string }> {
    const userId = await insertTestUser(dataSource);
    const terms = CircleTerms.create({
      payout: pen(6_000),
      months: 10,
      startsOn: Period.of(2026, 12),
    });
    const circle = Circle.open({ id: randomUUID(), terms });
    circle.join({
      userId,
      position: 3,
      idempotencyKey: `key-${randomUUID()}`,
      price: priceOf(TEST_PRICING.quote(terms, 3)),
      termsVersion: 'v1',
    });
    await circles.create(circle);
    await new OpenAgreementsUseCase(agreements, { signatureTtlHours: 48 }, clock).execute({
      userId,
      circleId: circle.id,
      position: 3,
      data: DATA,
    });
    const agreement = await agreements.find(userId, circle.id);
    return { userId, circleId: circle.id, agreementId: agreement!.id };
  }

  it('guarda el texto firmado con su versión y su hash', async () => {
    const { userId, circleId } = await joined();
    const agreement = (await agreements.find(userId, circleId))!;

    expect(agreement.status).toBe('pending');
    expect(agreement.contract.text).toBe(renderAgreement('contract', DATA));
    expect(agreement.contract.hash).toBe(hashOf(agreement.contract.text));
    expect(agreement.promissoryNote.text).toBe(renderAgreement('promissory_note', DATA));
    expect(agreement.promissoryNote.hash).toBe(hashOf(agreement.promissoryNote.text));
    expect(agreement.expiresAt.toISOString()).toBe('2026-11-18T12:00:00.000Z');
  });

  it('la evidencia de la firma no se puede modificar ni borrar', async () => {
    const { agreementId } = await joined();
    const signedAt = at('2026-11-17T09:00:00Z');
    await expect(
      agreements.sign(agreementId, {
        signedAt,
        ip: '200.1.2.3',
        userAgent: 'Ayni/1.0',
        contractHash: 'a'.repeat(64),
        promissoryNoteHash: 'b'.repeat(64),
      }),
    ).resolves.toBe(true);

    // Los triggers de solo inserción rechazan cualquier cambio posterior (COPAYNI-89).
    await expect(
      dataSource.query('UPDATE agreement_signatures SET ip = $1 WHERE agreement_id = $2', [
        '10.0.0.1',
        agreementId,
      ]),
    ).rejects.toThrow();
    await expect(
      dataSource.query('DELETE FROM agreement_signatures WHERE agreement_id = $1', [agreementId]),
    ).rejects.toThrow();

    const [row] = await dataSource.query<{ ip: string }[]>(
      'SELECT ip FROM agreement_signatures WHERE agreement_id = $1',
      [agreementId],
    );
    expect(row?.ip).toBe('200.1.2.3');
  });

  it('no firma dos veces ni después del plazo', async () => {
    const { agreementId } = await joined();
    const evidence = {
      signedAt: at('2026-11-17T09:00:00Z'),
      ip: null,
      userAgent: null,
      contractHash: 'a'.repeat(64),
      promissoryNoteHash: 'b'.repeat(64),
    };
    await expect(agreements.sign(agreementId, evidence)).resolves.toBe(true);
    // Segunda firma: el UPDATE condicionado a `pending` no toca nada.
    await expect(agreements.sign(agreementId, evidence)).resolves.toBe(false);

    const { agreementId: other } = await joined();
    await expect(agreements.sign(other, { ...evidence, signedAt: AFTER_TTL })).resolves.toBe(false);
  });

  it('al vencer el plazo, el acuerdo queda vencido y el turno se libera', async () => {
    const { userId, circleId } = await joined();
    // El turno 3 está tomado mientras el acuerdo sigue pendiente.
    expect((await circles.findById(circleId))!.isTaken(3)).toBe(true);

    clock.set(AFTER_TTL);
    const release = new ReleaseUnsignedMembershipsUseCase(
      new MembershipAgreementsAdapter(
        new OpenAgreementsUseCase(agreements, { signatureTtlHours: 48 }, clock),
        new ExpireAgreementsUseCase(agreements, clock),
        agreements,
      ),
      circles,
    );
    const result = await release.execute();

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(result.released).toBeGreaterThanOrEqual(1);
    expect((await agreements.find(userId, circleId))!.status).toBe('expired');
    // El turno vuelve a estar libre: la disponibilidad se calcula sobre circle_memberships.
    expect((await circles.findById(circleId))!.isTaken(3)).toBe(false);
    // Idempotente: una segunda corrida no vuelve a procesarlo.
    await expect(release.execute()).resolves.toMatchObject({ expired: 0 });
  });

  it('un acuerdo firmado no vence ni pierde el turno', async () => {
    const { userId, circleId, agreementId } = await joined();
    await agreements.sign(agreementId, {
      signedAt: at('2026-11-17T09:00:00Z'),
      ip: null,
      userAgent: null,
      contractHash: 'a'.repeat(64),
      promissoryNoteHash: 'b'.repeat(64),
    });

    clock.set(AFTER_TTL);
    await new ExpireAgreementsUseCase(agreements, clock).execute();

    expect((await agreements.find(userId, circleId))!.status).toBe('signed');
    expect((await circles.findById(circleId))!.isTaken(3)).toBe(true);
    await expect(agreements.hasUnsigned(userId)).resolves.toBe(false);
  });

  it('marca leído cada documento una sola vez', async () => {
    const { userId, circleId, agreementId } = await joined();
    const first = at('2026-11-16T13:00:00Z');
    await agreements.markRead(agreementId, 'contract', first);
    await agreements.markRead(agreementId, 'contract', at('2026-11-16T14:00:00Z'));

    const agreement = (await agreements.find(userId, circleId))!;
    expect(agreement.contract.readAt?.toISOString()).toBe(first.toISOString());
    expect(agreement.promissoryNote.readAt).toBeNull();
  });
});
