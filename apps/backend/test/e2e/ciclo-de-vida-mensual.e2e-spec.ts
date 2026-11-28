import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  CONTRIBUTIONS,
  type ContributionsPort,
  DISBURSEMENTS,
} from '@src/modules/circles/application/ports/cycle-payments.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  type CollectionOutcome,
  type Installment,
} from '@src/modules/circles/domain/entities/circle-cycle';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { createTestApp, TestClock } from '@test/support/create-test-app';

/**
 * El ciclo de vida completo de una junta mensual, de punta a punta (COPAYNI-122, criterio 2).
 *
 * El ticket pide **una** prueba que recorra creación, unión, cuotas, payout, morosidad y cierre
 * de una junta mensual y la compare con el comportamiento previo a la épica. Hasta ahora eso
 * estaba repartido entre varias suites; aquí va entero, con la API real para crear y unirse y
 * con el motor de ciclo real para los seis meses.
 *
 * La junta: S/ 6.000 en 6 turnos, una persona por turno. Arranca el mes siguiente al de la
 * unión, cobra el día 1 de cada mes y da tres días de gracia, que son los valores de la cadencia
 * mensual de producción. Lo que se mide es justo lo que la épica no debía cambiar:
 *
 * - el turno `n` cae en el mes `n-1` contado desde el arranque, y vence el día 1;
 * - cada mes cierra con el payout de quien tiene ese turno;
 * - quien no paga pasada la gracia queda vencido y expulsado;
 * - la junta termina en el mes del último turno, ni antes ni después.
 *
 * El cobro no lo hace la app: el motor cobra por débito (`ContributionsPort`). Aquí se sustituye
 * por un doble que paga todo salvo las cuotas que la prueba quiere dejar impagas.
 */

/** Cobra todo, menos las cuotas de un usuario desde el momento en que se le marca. */
class ContributionsConUnMoroso implements ContributionsPort {
  private defaulter: string | null = null;

  stopPaying(userId: string): void {
    this.defaulter = userId;
  }

  collect(installment: Installment & { circleId: string }): Promise<CollectionOutcome> {
    return Promise.resolve(installment.userId === this.defaulter ? 'failed' : 'paid');
  }
}

describe('Ciclo de vida de una junta mensual, de la creación al cierre (COPAYNI-122)', () => {
  let app: NestExpressApplication;
  const clock = new TestClock(new Date('2026-11-03T15:00:00Z'));
  const contributions = new ContributionsConUnMoroso();

  const TURNS = 6;
  const PAYOUT = 600_000;
  const TERMS_VERSION = '2026-11';
  /** Quien deja de pagar en el turno 3, después de haber cobrado el suyo. */
  const MOROSO = 1;

  const http = () => request(app.getHttpServer());

  /** `query` devuelve `any`: aquí es donde las filas reciben tipo. */
  const query = async <T>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
    app.get(DataSource).query<T[]>(sql, parameters);

  beforeAll(async () => {
    app = await createTestApp({
      verifier: null,
      clock,
      overrides: [
        { token: CONTRIBUTIONS, value: contributions },
        { token: DISBURSEMENTS, value: new FakeCyclePayments() },
      ],
    });
  }, 120_000);

  afterAll(() => app.close());

  /** Lima es UTC-5: las 15:00 UTC son las diez de la mañana del día indicado. */
  const at = (date: string) => new Date(`${date}T15:00:00Z`);

  async function signIn(): Promise<{ token: string; userId: string }> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token = verified.body.data.accessToken as string;
    await http()
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'bank_account' })
      .expect(200);
    const me = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    return { token, userId: me.body.data.id as string };
  }

  /**
   * Una junta terminada a nombre del usuario. El turno 1 es Fastest Payout y la regla de
   * confianza lo reserva a quien ya completó un círculo (COPAYNI-60); sin esto no se pueden
   * llenar los seis turnos, y el ciclo de vida necesita la junta llena.
   */
  async function grantTrust(userId: string): Promise<void> {
    const circleId = randomUUID();
    await query(
      `INSERT INTO circles (id, payout_amount, currency, turns, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, DATE '2026-01-01', 'finished')`,
      [circleId],
    );
    await query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, $4)`,
      [randomUUID(), circleId, userId, randomUUID()],
    );
  }

  /**
   * Una corrida de la tarea diaria. El resultado global no se mide: el motor recorre **todos**
   * los círculos de la base de pruebas, incluidos los que dejan los demás archivos de la suite.
   * Lo que esta prueba comprueba es el efecto sobre su propio círculo.
   */
  const advance = () => app.get(AdvanceCircleCyclesUseCase).execute();

  interface InstallmentRow {
    turn: number;
    position: number;
    status: string;
    amount: string;
    period: string;
    due_on: string;
  }

  const installmentsOf = (circleId: string) =>
    query<InstallmentRow>(
      `SELECT turn, position, status, amount,
              to_char(period, 'YYYY-MM-DD') AS period, to_char(due_on, 'YYYY-MM-DD') AS due_on
         FROM circle_installments WHERE circle_id = $1 ORDER BY turn, position`,
      [circleId],
    );

  it('recorre los seis turnos: cuotas, payouts, una mora y el cierre', async () => {
    // --- Creación y unión -------------------------------------------------------------------
    const users: { token: string; userId: string }[] = [];
    for (let position = 1; position <= TURNS; position += 1) {
      const user = await signIn();
      users.push(user);
      if (position === MOROSO) await grantTrust(user.userId);
    }

    const join = (position: number, circleId: string | null) =>
      http()
        .post('/v1/circles/join')
        .set('Authorization', `Bearer ${users[position - 1]!.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          circleId,
          payoutAmount: PAYOUT,
          months: TURNS,
          position,
          termsVersion: TERMS_VERSION,
        })
        .expect(201);

    /** Lo que firmó cada quien al unirse, que es contra lo que se mide su payout. */
    const signed: { netPayout: { amount: number }; payoutPeriod: string }[] = [];
    const first = await join(1, null);
    signed.push(first.body.data);
    const circleId = first.body.data.circleId as string;
    // La junta arranca el mes siguiente al de la unión, con cada turno en su mes.
    expect(first.body.data.startsOn).toBe('2026-12');
    expect(first.body.data.months).toBe(TURNS);
    expect(first.body.data.payoutPeriod).toBe('2026-12');
    expect(first.body.data.installments).toHaveLength(TURNS);

    for (let position = 2; position <= TURNS; position += 1) {
      signed.push((await join(position, circleId)).body.data);
    }
    // Cada quien cobra en el mes de su turno, contado desde el arranque.
    expect(signed.map(({ payoutPeriod }) => payoutPeriod)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
    ]);

    const detail = await http()
      .get(`/v1/me/circles/${circleId}`)
      .set('Authorization', `Bearer ${users[1]!.token}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      startsOn: '2026-12',
      endsOn: '2027-05',
      months: TURNS,
    });
    const PERIODS = (detail.body.data.turns as { period: string }[]).map(({ period }) => period);
    expect(PERIODS).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);

    // --- Los seis turnos --------------------------------------------------------------------
    for (let turn = 1; turn <= TURNS; turn += 1) {
      const period = PERIODS[turn - 1]!;
      if (turn === 3) contributions.stopPaying(users[MOROSO - 1]!.userId);

      // El día 1 del mes del turno vencen las cuotas, se cobran y se cierra el mes.
      clock.set(at(`${period}-01`));
      await advance();

      const opened = (await installmentsOf(circleId)).filter((row) => Number(row.turn) === turn);
      expect(opened.length).toBeGreaterThan(0);
      // Todas las cuotas del turno caen en su mes y vencen el día 1, en toda la junta.
      for (const row of opened) {
        expect(row.period).toBe(`${period}-01`);
        expect(row.due_on).toBe(`${period}-01`);
      }

      if (turn === 3) {
        // --- Morosidad: durante la gracia se reintenta; pasada, vence y expulsa -------------
        const impaga = opened.find((row) => Number(row.position) === MOROSO);
        expect(impaga?.status).toBe('overdue');

        clock.set(at(`${period}-05`));
        await advance();

        const [expulsado] = await query<{ expelled_at: string | null }>(
          'SELECT expelled_at FROM circle_memberships WHERE circle_id = $1 AND position = $2',
          [circleId, MOROSO],
        );
        expect(expulsado?.expelled_at).not.toBeNull();
      }

      // El mes cierra con el payout de quien tiene ese turno.
      const [payout] = await query<{ position: number; amount: string }>(
        'SELECT position, amount FROM circle_payouts WHERE circle_id = $1 AND turn = $2',
        [circleId, turn],
      );
      expect(Number(payout?.position)).toBe(turn);
      const firmado = signed[turn - 1]!.netPayout.amount;
      if (turn < 3) {
        // Mientras todos pagan, se cobra exactamente el payout neto que se firmó: el pozo menos
        // la retención, las comisiones y los descuentos de ese turno.
        expect(Number(payout?.amount)).toBe(firmado);
      } else {
        // Desde la expulsión, la cuota que falta la cubre el fondo de garantía mientras le
        // alcance el saldo (COPAYNI-58): el payout puede quedarse corto, nunca pasarse.
        expect(Number(payout?.amount)).toBeGreaterThan(0);
        expect(Number(payout?.amount)).toBeLessThanOrEqual(firmado);
      }
    }

    // --- Cierre -----------------------------------------------------------------------------
    const [circle] = await query<{ cycle_state: string }>(
      'SELECT cycle_state FROM circles WHERE id = $1',
      [circleId],
    );
    // Termina en el mes del último turno, ni antes ni después.
    expect(circle?.cycle_state).toBe('finished');

    const payouts = await query<{ turn: number }>(
      'SELECT turn FROM circle_payouts WHERE circle_id = $1 ORDER BY turn',
      [circleId],
    );
    expect(payouts.map(({ turn }) => Number(turn))).toEqual([1, 2, 3, 4, 5, 6]);

    // Y el cronograma completo: seis meses consecutivos desde el arranque, sin huecos.
    const periods = [...new Set((await installmentsOf(circleId)).map(({ period }) => period))];
    expect(periods).toEqual(PERIODS.map((p) => `${p}-01`));
  }, 180_000);
});
