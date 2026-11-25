import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CIRCLE_ASSIGNMENT } from '@src/modules/circles/application/use-cases/assignment-settings';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '@src/modules/circles/application/ports/join-config-repository.port';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { CLIENT_CADENCES_HEADER } from '@src/modules/circles/presentation/http/client-cadences';
import { Money } from '@src/shared/domain/value-objects/money';
import { createTestApp } from '@test/support/create-test-app';

const pen = (amount: number) => Money.of(amount, 'PEN');

/**
 * La configuración con el **rango** de turnos de COPAYNI-125, que es la que hace posible una
 * junta de 4 turnos: la lista cerrada de hoy solo ofrece 6, 10 y 12.
 */
const RANGED_JOIN_CONFIG: JoinConfigRepositoryPort = {
  getForUser: () =>
    Promise.resolve(
      JoinConfig.create({
        payoutRange: PayoutRange.create({
          min: pen(300_000),
          max: pen(12_000_000),
          step: pen(50_000),
        }),
        savingProgramMax: pen(100_000_000),
        userPayoutLimit: null,
        turnRange: { min: 2, max: 24 },
      }),
    ),
};

/**
 * Elegir frecuencia y número de turnos al unirse, como contrato HTTP (COPAYNI-116).
 *
 * El flujo de unión pedía monto, duración en meses de una lista cerrada y turno de cobro. Con
 * cadencias gana un paso —la frecuencia— y las duraciones dejan de ser meses: son turnos, con la
 * fecha real en que termina la junta.
 *
 * Lo que se comprueba aquí es que el servidor entrega lo que la pantalla necesita para no mentir:
 * las combinaciones que existen para ese monto, la duración en la unidad de la cadencia y las
 * fechas reales. Las dos puertas —bandera del servidor y capacidad del cliente— siguen rigiendo.
 */
describe('Unión por cadencia (COPAYNI-116)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      verifier: null,
      // Semanal y quincenal habilitadas, como quedarían tras la decisión de negocio; la mensual
      // nunca se puede quitar (COPAYNI-121).
      overrides: [
        {
          token: CIRCLE_ASSIGNMENT,
          value: {
            strategy: 'fill_oldest',
            cadences: [Cadence.monthly, Cadence.biweekly, Cadence.weekly],
            startOffsetMonths: 1,
            timeZone: 'America/Lima',
          },
        },
        { token: JOIN_CONFIG_REPOSITORY, value: RANGED_JOIN_CONFIG },
      ],
    });
  });

  afterAll(() => app.close());

  async function signIn(): Promise<string> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token: string = verified.body.data.accessToken;
    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'bank_account' })
      .expect(200);
    return token;
  }

  const get = (token: string, path: string, cadences?: string) => {
    const call = request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
    return cadences ? call.set(CLIENT_CADENCES_HEADER, cadences) : call;
  };

  it('ofrece las duraciones que existen para el monto, en la unidad de la cadencia', async () => {
    const token = await signIn();

    const response = await get(
      token,
      '/v1/circles/installment-options?payoutAmount=1200000&cadence=weekly',
      'monthly,weekly',
    ).expect(200);

    const { cadence, options } = response.body.data as {
      cadence: string;
      options: { turns: number; unit: string; installment: { amount: number } }[];
    };
    expect(cadence).toBe('weekly');
    // De S/ 12.000 solo existen las duraciones con cuota exacta (COPAYNI-125), no las 23 del
    // rango configurado.
    expect(options.map(({ turns }) => turns)).toEqual([2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24]);
    expect(new Set(options.map(({ unit }) => unit))).toEqual(new Set(['Semana']));
    expect(
      options.every(({ turns, installment }) => installment.amount * turns === 1_200_000),
    ).toBe(true);
  });

  it('cuatro turnos semanales duran 28 días, con su fecha de fin real', async () => {
    const token = await signIn();

    const response = await get(
      token,
      '/v1/circles/slots?payoutAmount=1200000&months=4&cadence=weekly',
      'weekly',
    ).expect(200);

    const data = response.body.data as {
      turns: number;
      cadence: string;
      unit: string;
      durationDays: number;
      startsOnDate: string;
      endsOnDate: string;
      months: number;
    };
    expect(data).toMatchObject({ turns: 4, cadence: 'weekly', unit: 'Semana', durationDays: 28 });
    // Y la fecha de fin es real: tres semanas después del primer turno.
    const start = new Date(`${data.startsOnDate}T12:00:00Z`);
    const end = new Date(`${data.endsOnDate}T12:00:00Z`);
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(21);
    // El alias que lee la app publicada sigue valiendo el número de turnos.
    expect(data.months).toBe(4);
  });

  it('cuatro turnos quincenales duran 56 días', async () => {
    const token = await signIn();

    const response = await get(
      token,
      '/v1/circles/slots?payoutAmount=1200000&months=4&cadence=biweekly',
      'biweekly',
    ).expect(200);

    expect(response.body.data).toMatchObject({
      turns: 4,
      cadence: 'biweekly',
      unit: 'Quincena',
      durationDays: 56,
    });
  });

  it('una junta mensual sigue respondiendo lo de siempre', async () => {
    const token = await signIn();

    const response = await get(token, '/v1/circles/slots?payoutAmount=1200000&months=4').expect(
      200,
    );

    expect(response.body.data).toMatchObject({
      turns: 4,
      months: 4,
      cadence: 'monthly',
      unit: 'Mes',
    });
    // Arranca el día 1, como todas las mensuales (COPAYNI-108).
    expect(response.body.data.startsOnDate).toMatch(/-01$/);
  });

  it('un cliente que no declara la cadencia no la recibe, ni en cuotas ni en slots', async () => {
    const token = await signIn();

    for (const path of [
      '/v1/circles/installment-options?payoutAmount=1200000&cadence=weekly',
      '/v1/circles/slots?payoutAmount=1200000&months=4&cadence=weekly',
    ]) {
      const response = await get(token, path).expect(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { cadence: 'not_supported_by_client' },
      });
    }
  });

  it('una frecuencia desconocida se rechaza en lugar de caer en la mensual', async () => {
    const token = await signIn();

    await get(
      token,
      '/v1/circles/installment-options?payoutAmount=1200000&cadence=trimestral',
      'monthly',
    ).expect(400);
  });

  it('unirse con la frecuencia elegida crea la junta de esa cadencia', async () => {
    const token = await signIn();

    const joined = await request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${token}`)
      .set(CLIENT_CADENCES_HEADER, 'weekly')
      .set('Idempotency-Key', `key-${randomUUID()}`)
      .send({
        circleId: null,
        payoutAmount: 1_200_000,
        months: 4,
        position: 2,
        cadence: 'weekly',
        termsVersion: '2026-11',
      })
      .expect((response) => {
        if (response.status !== 201) {
          throw new Error(`${response.status}: ${JSON.stringify(response.body)}`);
        }
      });

    const { circleId } = joined.body.data as { circleId: string };
    const detail = await get(token, `/v1/me/circles/${circleId}`, 'weekly').expect(200);

    expect(detail.body.data).toMatchObject({ cadence: 'weekly', turnCount: 4, unit: 'Semana' });
    // Los cuatro turnos con su fecha real, todos distintos aunque caigan en el mismo mes.
    const turns = detail.body.data.turns as { turn: number; payoutOn: string }[];
    expect(turns).toHaveLength(4);
    expect(new Set(turns.map(({ payoutOn }) => payoutOn)).size).toBe(4);
  });
});
