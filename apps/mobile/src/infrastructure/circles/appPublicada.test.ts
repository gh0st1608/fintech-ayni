import { z } from 'zod';

import respuestasDeHoy from './__fixtures__/respuestasDeHoy.json';

/**
 * El parser de la app publicada contra las respuestas de hoy (COPAYNI-122).
 *
 * La app que está en la tienda es la del commit 91970af (17/11/2026), anterior a la épica de
 * cadencias. Valida cada respuesta con zod y descarta la que no cumple su esquema, así que la
 * pregunta que decide si la épica rompió lo que ya funcionaba es concreta: ¿su parser acepta lo
 * que el servidor responde hoy?
 *
 * Los esquemas de abajo son **copia literal** de los DTO de ese commit
 * (`JoinConfigApiRepository.ts`, `CircleQuoteApiRepository.ts`, `CircleMembershipApiRepository.ts`)
 * y no deben «actualizarse»: su valor es justamente quedar congelados. El fixture son respuestas
 * reales del servidor, capturadas el 27/11/2026 ejecutando las peticiones de esa app contra la
 * API de `test/e2e/app-publicada.e2e-spec.ts` del backend.
 *
 * Lo que demuestra: los campos que la épica agregó (`cadences`, `payoutOn`, `turns`, `cadence`,
 * `unit`, `startsOnDate`, `endsOnDate`, `durationDays`, `turnCount`, `currentTurn`, `allowed`) son
 * aditivos. `z.object` descarta las claves que no conoce, así que la app publicada ni las ve.
 */
const moneyDto = z.object({
  amount: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const slotTypeDto = z.enum(['fastest_payout', 'lowest_fees', 'highest_return']);

/** GET /circles/join-config, tal como lo validaba la app publicada. */
const joinConfigDto = z.object({
  payout: z.object({ min: moneyDto, max: moneyDto, step: moneyDto }),
  userPayoutLimit: moneyDto.nullable(),
  savingProgramMax: moneyDto,
  currencies: z
    .array(
      z.object({
        code: z.string().regex(/^[A-Z]{3}$/),
        official: z.boolean(),
        rateToOfficial: z.string().regex(/^\d+(\.\d+)?$/),
      }),
    )
    .min(1),
  termsVersion: z.string().min(1),
});

/** GET /circles/installment-options. */
const installmentOptionsDto = z.object({
  payout: moneyDto,
  options: z.array(
    z.object({
      months: z.number().int().positive(),
      installment: moneyDto,
      withinMonthlyLimit: z.boolean().optional(),
    }),
  ),
});

/** GET /circles/slots. */
const slotsDto = z.object({
  circleId: z.string().min(1).nullable(),
  payout: moneyDto,
  months: z.number().int().positive(),
  slots: z.array(
    z.object({
      position: z.number().int().positive(),
      payoutPeriod: z.string(),
      type: slotTypeDto,
      fee: moneyDto,
      discount: moneyDto,
      catchUp: moneyDto.optional(),
      retention: moneyDto.optional(),
      notAllowedReason: z
        .enum(['trust_required', 'identity_required', 'income_required'])
        .nullable()
        .optional(),
      available: z.boolean(),
    }),
  ),
});

/** POST /circles/join. */
const joinedCircleDto = z.object({
  circleId: z.string().min(1),
  startsOn: z.string().regex(PERIOD),
  payout: moneyDto,
  months: z.number().int().positive(),
  position: z.number().int().positive(),
  payoutPeriod: z.string().regex(PERIOD),
  type: slotTypeDto,
  installments: z.array(moneyDto).min(1),
  netPayout: moneyDto,
  catchUp: moneyDto.optional(),
  retention: moneyDto.optional(),
  created: z.boolean(),
});

/** GET /me/circles. */
const myCirclesDto = z.object({
  items: z.array(
    z.object({
      circleId: z.string().min(1),
      status: z.enum(['active', 'finished']),
      payout: moneyDto,
      months: z.number().int().positive(),
      startsOn: z.string().regex(PERIOD),
      endsOn: z.string().regex(PERIOD),
      position: z.number().int().positive(),
      payoutPeriod: z.string().regex(PERIOD),
      type: slotTypeDto,
      installments: z.array(moneyDto).min(1),
      adminFee: moneyDto,
      netPayout: moneyDto,
      joinedAt: z.iso.datetime({ offset: true }),
      expelled: z.boolean(),
    }),
  ),
  nextCursor: z.string().min(1).nullable(),
});

/** GET /me/circles/:id. */
const myCircleDetailDto = z.object({
  circleId: z.string().min(1),
  state: z.enum(['collecting', 'approving', 'contributing', 'paused', 'cancelled', 'finished']),
  payout: moneyDto,
  months: z.number().int().positive(),
  startsOn: z.string().regex(PERIOD),
  endsOn: z.string().regex(PERIOD),
  currentPeriod: z.string().regex(PERIOD).nullable(),
  currentMonth: z.number().int().positive().nullable(),
  position: z.number().int().positive(),
  payoutPeriod: z.string().regex(PERIOD),
  type: slotTypeDto,
  installments: z.array(moneyDto).min(1),
  netPayout: moneyDto,
  retention: moneyDto,
  nextDue: z
    .object({
      installmentId: z.string().min(1),
      period: z.string().regex(PERIOD),
      dueOn: z.string().regex(DATE),
      amount: moneyDto,
      status: z.enum(['pending', 'overdue']),
    })
    .nullable(),
  turns: z.array(
    z.object({
      position: z.number().int().positive(),
      period: z.string().regex(PERIOD),
      memberName: z.string().nullable(),
      isMe: z.boolean(),
      status: z.enum(['paid', 'current', 'upcoming', 'vacant']),
    }),
  ),
});

describe('El parser de la app publicada acepta las respuestas de hoy (COPAYNI-122)', () => {
  it('GET /circles/join-config', () => {
    const parsed = joinConfigDto.parse(respuestasDeHoy.joinConfig);

    expect(parsed.termsVersion).toBe('2026-11');
    expect(parsed.payout.step).toEqual({ amount: 50_000, currency: 'PEN' });
    expect(parsed.currencies.map(({ code }) => code)).toEqual(['PEN', 'USD']);
    // Y `cadences`, que la app publicada no conoce, no llega a su modelo.
    expect(Object.keys(parsed)).not.toContain('cadences');
  });

  it('GET /circles/installment-options', () => {
    const parsed = installmentOptionsDto.parse(respuestasDeHoy.installmentOptions);

    // Las mismas duraciones y las mismas cuotas que ofrecía antes: 6, 10 y 12 meses.
    expect(parsed.options.map(({ months }) => months)).toEqual([6, 10, 12]);
    expect(parsed.options[1]?.installment).toEqual({ amount: 975_000, currency: 'PEN' });
    // `turns`, `cadence`, `unit` y `approximateDays` se descartan.
    expect(Object.keys(parsed.options[0] ?? {})).toEqual(['months', 'installment']);
  });

  it('GET /circles/slots', () => {
    const parsed = slotsDto.parse(respuestasDeHoy.slots);

    expect(parsed.months).toBe(10);
    const first = parsed.slots[0];
    // El turno 1 sigue siendo el de cobro más rápido, con su comisión y su retención.
    expect(first).toMatchObject({
      position: 1,
      payoutPeriod: '2026-12',
      type: 'fastest_payout',
      fee: { amount: 975_000, currency: 'PEN' },
      retention: { amount: 1_950_000, currency: 'PEN' },
      available: true,
      notAllowedReason: 'trust_required',
    });
    // `payoutOn` y `allowed`, que la épica agregó, no llegan a su modelo.
    expect(Object.keys(first ?? {})).not.toContain('payoutOn');
    expect(Object.keys(first ?? {})).not.toContain('allowed');
  });

  it('POST /circles/join', () => {
    const parsed = joinedCircleDto.parse(respuestasDeHoy.join);

    expect(parsed).toMatchObject({
      // `startsOn` sigue siendo el mes: la app publicada lo valida contra YYYY-MM y lo dibuja así.
      startsOn: '2026-12',
      months: 10,
      position: 3,
      payoutPeriod: '2027-02',
      type: 'lowest_fees',
      netPayout: { amount: 7_800_000, currency: 'PEN' },
      retention: { amount: 1_950_000, currency: 'PEN' },
      created: true,
    });
    for (const clave of ['startsOnDate', 'endsOnDate', 'turns', 'cadence']) {
      expect(Object.keys(parsed)).not.toContain(clave);
    }
  });

  it('GET /me/circles', () => {
    const parsed = myCirclesDto.parse(respuestasDeHoy.myCircles);

    expect(parsed.items[0]).toMatchObject({
      status: 'active',
      months: 10,
      startsOn: '2026-12',
      endsOn: '2027-09',
      position: 3,
      adminFee: { amount: 1_170_000, currency: 'PEN' },
      expelled: false,
    });
    expect(parsed.nextCursor).toBeNull();
    expect(Object.keys(parsed.items[0] ?? {})).not.toContain('startsOnDate');
  });

  it('GET /me/circles/:id', () => {
    const parsed = myCircleDetailDto.parse(respuestasDeHoy.myCircleDetail);

    expect(parsed).toMatchObject({
      state: 'collecting',
      months: 10,
      startsOn: '2026-12',
      endsOn: '2027-09',
      currentPeriod: null,
      currentMonth: null,
      nextDue: null,
    });
    // Cada turno con su mes, que es lo que la pantalla de turnos dibuja.
    expect(parsed.turns[0]).toEqual({
      position: 1,
      period: '2026-12',
      memberName: null,
      isMe: false,
      status: 'vacant',
    });
    for (const clave of ['turnCount', 'cadence', 'unit', 'currentTurn', 'endsOnDate']) {
      expect(Object.keys(parsed)).not.toContain(clave);
    }
  });
});
