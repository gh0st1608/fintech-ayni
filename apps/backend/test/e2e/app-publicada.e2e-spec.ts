import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { CLIENT_CADENCES_HEADER } from '@src/modules/circles/presentation/http/client-cadences';
import { createTestApp } from '@test/support/create-test-app';

/**
 * Regresión de la app publicada (COPAYNI-122).
 *
 * La promesa a negocio fue «sin que afecte a lo que ya viene funcionando», y lo que ya viene
 * funcionando es la app que está en la tienda: la del commit 91970af (17/11/2026), el estado
 * anterior a esta épica. Esa app **no** envía la cabecera `x-ayni-cadences` ni el campo
 * `cadence`, y valida cada respuesta contra su propio esquema; una respuesta que no lo cumple la
 * descarta con `INVALID_RESPONSE` y la pantalla queda vacía.
 *
 * Esta prueba reproduce sus peticiones tal como las hace —mismas rutas, mismos parámetros, mismo
 * cuerpo, sin cabecera— y comprueba campo por campo lo que su esquema exige. Los campos que la
 * épica agregó (`cadences`, `payoutOn`, `turns`, `cadence`, `startsOnDate`, `endsOnDate`) son
 * aditivos: `z.object` descarta las claves que no conoce, así que no la rompen. Eso se comprueba
 * del lado de la app, en `apps/mobile/src/infrastructure/circles/appPublicada.test.ts`, con los
 * esquemas de ese commit copiados literalmente y una respuesta de hoy.
 *
 * Los campos exigidos salen de los DTO de ese commit:
 * `apps/mobile/src/infrastructure/circles/{JoinConfigApiRepository,CircleQuoteApiRepository,
 * CircleMembershipApiRepository}.ts`.
 */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `moneyDto`: entero en unidades menores y moneda ISO 4217. */
const money = () => ({
  amount: expect.any(Number),
  currency: expect.stringMatching(/^[A-Z]{3}$/),
});

const SLOT_TYPES = ['fastest_payout', 'lowest_fees', 'highest_return'];

/** Las claves que la app publicada lee de un objeto; que falte una la deja sin pantalla. */
const expectKeys = (value: object, keys: string[]) =>
  expect(Object.keys(value)).toEqual(expect.arrayContaining(keys));

/** 112.500 en 10 turnos: un payout propio, con cuotas exactas y en un salto del slider. */
const PAYOUT = 11_250_000;
const TERMS_VERSION = '2026-11';

describe('La app publicada ve lo mismo que antes de la épica (COPAYNI-122)', () => {
  let app: NestExpressApplication;
  let token: string;
  let joined: Record<string, unknown>;

  beforeAll(async () => {
    // Sin overrides: la configuración por defecto, que es la de producción (solo mensual).
    app = await createTestApp({ verifier: null });
    token = await signIn();
    const response = await join({
      circleId: null,
      payoutAmount: PAYOUT,
      currency: 'PEN',
      months: 10,
      position: 3,
      termsVersion: TERMS_VERSION,
    }).expect(201);
    joined = response.body.data;
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
    const accessToken: string = verified.body.data.accessToken;
    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ method: 'bank_account' })
      .expect(200);
    return accessToken;
  }

  /** Una petición de la app publicada: sin la cabecera de cadencias. */
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const join = (body: Record<string, unknown>, key: string = randomUUID()) =>
    request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);

  it('GET /circles/join-config cumple el esquema publicado', async () => {
    const { body } = await get('/v1/circles/join-config?currency=PEN').expect(200);

    expectKeys(body.data, [
      'payout',
      'userPayoutLimit',
      'savingProgramMax',
      'currencies',
      'termsVersion',
    ]);
    expect(body.data).toMatchObject({
      payout: { min: money(), max: money(), step: money() },
      savingProgramMax: money(),
      termsVersion: expect.stringMatching(/.+/),
    });
    // `moneyDto.nullable()`: o un monto, o null; nunca ausente ni otra cosa.
    expect(body.data.userPayoutLimit === null || body.data.userPayoutLimit.currency).toBeTruthy();
    expect(body.data.currencies.length).toBeGreaterThanOrEqual(1);
    for (const currency of body.data.currencies) {
      expect(currency).toMatchObject({
        code: expect.stringMatching(/^[A-Z]{3}$/),
        official: expect.any(Boolean),
        rateToOfficial: expect.stringMatching(/^\d+(\.\d+)?$/),
      });
    }
  });

  it('GET /circles/installment-options cumple el esquema publicado', async () => {
    const { body } = await get(
      `/v1/circles/installment-options?payoutAmount=${PAYOUT}&currency=PEN`,
    ).expect(200);

    expect(body.data).toMatchObject({ payout: money() });
    expect(body.data.options.length).toBeGreaterThanOrEqual(1);
    for (const option of body.data.options) {
      expect(option).toMatchObject({ months: expect.any(Number), installment: money() });
      expect(Number.isInteger(option.months) && option.months > 0).toBe(true);
    }
  });

  it('GET /circles/slots cumple el esquema publicado', async () => {
    const { body } = await get(
      `/v1/circles/slots?payoutAmount=${PAYOUT}&months=10&currency=PEN`,
    ).expect(200);

    expect(body.data).toMatchObject({ payout: money(), months: 10 });
    expect(body.data.circleId === null || typeof body.data.circleId).toBeTruthy();
    expect(body.data.slots).toHaveLength(10);
    for (const slot of body.data.slots) {
      expectKeys(slot, [
        'position',
        'payoutPeriod',
        'type',
        'fee',
        'discount',
        'catchUp',
        'retention',
        'notAllowedReason',
        'available',
      ]);
      expect(slot).toMatchObject({
        position: expect.any(Number),
        // La app publicada lo lee como texto y lo muestra tal cual: sigue siendo un mes.
        payoutPeriod: expect.stringMatching(PERIOD),
        fee: money(),
        discount: money(),
        catchUp: money(),
        retention: money(),
        available: expect.any(Boolean),
      });
      expect(SLOT_TYPES).toContain(slot.type);
      // `nullable().optional()` con un conjunto cerrado de motivos.
      if (slot.notAllowedReason !== null) {
        expect(['trust_required', 'identity_required', 'income_required']).toContain(
          slot.notAllowedReason,
        );
      }
    }
  });

  it('GET /circles/recommended cumple el esquema publicado', async () => {
    // Para otro usuario, que no es miembro de ninguna de las juntas que recomienda.
    const otro = await signIn();
    const { body } = await request(app.getHttpServer())
      .get('/v1/circles/recommended')
      .set('Authorization', `Bearer ${otro}`)
      .expect(200);

    expect(body.data.items.length).toBeGreaterThan(0);
    for (const item of body.data.items) {
      expectKeys(item, [
        'circleId',
        'payout',
        'months',
        'startsOn',
        'endsOn',
        'baseInstallment',
        'adminFee',
        'availableSlots',
        'vacancies',
      ]);
      expect(item).toMatchObject({
        circleId: expect.stringMatching(/.+/),
        payout: money(),
        months: expect.any(Number),
        startsOn: expect.stringMatching(PERIOD),
        endsOn: expect.stringMatching(PERIOD),
        baseInstallment: money(),
        adminFee: money(),
        availableSlots: expect.any(Number),
      });
      for (const vacancy of item.vacancies ?? []) {
        expect(vacancy).toMatchObject({
          position: expect.any(Number),
          payoutPeriod: expect.stringMatching(PERIOD),
        });
      }
    }
  });

  it('POST /circles/join con el cuerpo publicado cumple su esquema', () => {
    expectKeys(joined, [
      'circleId',
      'startsOn',
      'payout',
      'months',
      'position',
      'payoutPeriod',
      'type',
      'installments',
      'netPayout',
      'catchUp',
      'retention',
      'created',
    ]);
    expect(joined).toMatchObject({
      circleId: expect.stringMatching(/.+/),
      // Sigue siendo el mes, no la fecha: la app publicada lo valida contra YYYY-MM.
      startsOn: expect.stringMatching(PERIOD),
      payout: { amount: PAYOUT, currency: 'PEN' },
      months: 10,
      position: 3,
      payoutPeriod: expect.stringMatching(PERIOD),
      netPayout: money(),
      catchUp: money(),
      retention: money(),
      created: true,
    });
    expect(SLOT_TYPES).toContain(joined.type);
    expect(joined.installments).toHaveLength(10);
  });

  it('GET /me/circles cumple el esquema publicado', async () => {
    const { body } = await get('/v1/me/circles?status=active').expect(200);

    const mine = (body.data.items as { circleId: string }[]).find(
      (item) => item.circleId === joined.circleId,
    );
    expect(mine).toBeDefined();
    expectKeys(mine!, [
      'circleId',
      'status',
      'payout',
      'months',
      'startsOn',
      'endsOn',
      'position',
      'payoutPeriod',
      'type',
      'installments',
      'adminFee',
      'netPayout',
      'joinedAt',
      'expelled',
    ]);
    expect(mine).toMatchObject({
      status: 'active',
      payout: money(),
      months: 10,
      startsOn: expect.stringMatching(PERIOD),
      endsOn: expect.stringMatching(PERIOD),
      position: 3,
      payoutPeriod: expect.stringMatching(PERIOD),
      adminFee: money(),
      netPayout: money(),
      // `z.iso.datetime({ offset: true })`: la app lo pasa a Date.
      joinedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/),
      expelled: false,
    });
    expect(body.data.nextCursor === null || typeof body.data.nextCursor).toBeTruthy();
  });

  it('GET /me/circles/:id cumple el esquema publicado', async () => {
    const { body } = await get(`/v1/me/circles/${joined.circleId as string}`).expect(200);

    expectKeys(body.data, [
      'circleId',
      'state',
      'payout',
      'months',
      'startsOn',
      'endsOn',
      'currentPeriod',
      'currentMonth',
      'position',
      'payoutPeriod',
      'type',
      'installments',
      'netPayout',
      'retention',
      'nextDue',
      'turns',
    ]);
    expect(body.data).toMatchObject({
      state: expect.stringMatching(
        /^(collecting|approving|contributing|paused|cancelled|finished)$/,
      ),
      months: 10,
      startsOn: expect.stringMatching(PERIOD),
      endsOn: expect.stringMatching(PERIOD),
      netPayout: money(),
      retention: money(),
    });
    expect(body.data.installments.length).toBeGreaterThanOrEqual(1);
    // `currentPeriod` y `currentMonth` siguen siendo mes y número de mes, o null.
    expect(body.data.currentPeriod === null || PERIOD.test(body.data.currentPeriod)).toBe(true);
    expect(body.data.currentMonth === null || Number.isInteger(body.data.currentMonth)).toBe(true);
    if (body.data.nextDue !== null) {
      expect(body.data.nextDue).toMatchObject({
        installmentId: expect.stringMatching(/.+/),
        period: expect.stringMatching(PERIOD),
        dueOn: expect.stringMatching(DATE),
        amount: money(),
        status: expect.stringMatching(/^(pending|overdue)$/),
      });
    }
    // Cada turno con el mes que la app publicada dibuja, además del día que agregó la épica.
    expect(body.data.turns).toHaveLength(10);
    for (const turn of body.data.turns) {
      expect(turn).toMatchObject({
        position: expect.any(Number),
        period: expect.stringMatching(PERIOD),
        isMe: expect.any(Boolean),
        status: expect.stringMatching(/^(paid|current|upcoming|vacant)$/),
      });
      expect(turn.memberName === null || typeof turn.memberName).toBeTruthy();
    }
  });

  it('con la bandera por defecto no hay ruta que cree una junta no mensual', async () => {
    // Una duración que sí se ofrece, para que lo que rechace la petición sea la cadencia y no
    // el número de turnos: en producción las duraciones son 6, 10 y 12.
    const body = {
      circleId: null,
      payoutAmount: PAYOUT,
      currency: 'PEN',
      months: 10,
      position: 1,
      termsVersion: TERMS_VERSION,
    };

    // Con la bandera por defecto la puerta es la habilitación, y se comprueba antes que la
    // capacidad del cliente: la cadencia se rechaza igual la declare o no.
    for (const cadence of ['weekly', 'biweekly']) {
      const sinCabecera = await join({ ...body, cadence }).expect(400);
      expect(sinCabecera.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { cadence: 'not_enabled' },
      });

      const declarando = await request(app.getHttpServer())
        .post('/v1/circles/join')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .set(CLIENT_CADENCES_HEADER, cadence)
        .send({ ...body, cadence })
        .expect(400);
      expect(declarando.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { cadence: 'not_enabled' },
      });
    }

    // Y sin cadencia, la junta que se crea es mensual.
    const created = await join({ ...body, position: 5 }).expect(201);
    expect(created.body.data.cadence ?? 'monthly').toBe('monthly');
    expect(created.body.data.startsOn).toMatch(PERIOD);
  });
});
