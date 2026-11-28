import { validateEnvironment } from '@src/config/env.validation';
import { type CadenceId } from '@src/modules/circles/domain/value-objects/cadence';
import { dueSoonByCadenceFrom } from '@src/modules/notifications/domain/due-soon-lead';
import {
  type NotificationData,
  type NotificationType,
} from '@src/modules/notifications/domain/notification';
import {
  buildPushMessage,
  type PushLanguage,
} from '@src/modules/notifications/domain/push-message';
import { TEST_ENV } from '@test/setup-env';

/**
 * Textos y momento de los avisos en cada cadencia (COPAYNI-120).
 *
 * Los avisos estaban redactados y programados para un ciclo mensual, y al cambiar la cadencia
 * fallan en dos cosas distintas:
 *
 * - **El texto miente.** «Tu cuota de este mes» es falso cuando hay cuatro cuotas en el mes, y
 *   «Este mes cobras» se lo diría a los cuatro miembros que cobran en noviembre.
 * - **El momento molesta.** Tres días de antelación sobre un ciclo de 7 dejan el recordatorio
 *   casi pegado al turno anterior.
 *
 * La cadencia mensual tiene que quedar **palabra por palabra** como estaba: es la de todas las
 * juntas que existen.
 */
const message = (type: NotificationType, data: NotificationData, language: PushLanguage = 'es') =>
  buildPushMessage({ id: 'n-1', type, data }, language);

const AMOUNT = { amount: 300_000, currency: 'PEN' };

/** Los avisos cuyo texto hablaba de meses. */
const MONTH_TEXTS: readonly NotificationType[] = [
  'payment_received',
  'payout_turn',
  'payout_disbursed',
  'circle_started',
  'circle_resumed',
];

const DATA: Record<NotificationType, NotificationData> = {
  installment_due_soon: { amount: AMOUNT, dueOn: '2026-11-11' },
  installment_due_today: { amount: AMOUNT, dueOn: '2026-11-11' },
  payment_received: { amount: AMOUNT, period: '2026-11', turn: 2 },
  payment_failed: { amount: AMOUNT, dueOn: '2026-11-11' },
  payout_turn: { amount: AMOUNT, period: '2026-11', dueOn: '2026-11-11', turn: 2 },
  payout_disbursed: { amount: AMOUNT, period: '2026-11', turn: 2 },
  document_approved: { documentType: 'national_id' },
  document_rejected: { documentType: 'national_id' },
  circle_started: { period: '2026-11', dueOn: '2026-11-04' },
  circle_paused: {},
  circle_resumed: {},
  circle_member_joined: {},
};

describe('Textos de los avisos por cadencia (COPAYNI-120)', () => {
  it.each(MONTH_TEXTS)('en cadencia mensual, el texto de %s es el de siempre', (type) => {
    // Sin cadencia en los datos —como los avisos de las juntas que ya existen— y con `monthly`
    // explícito, el texto tiene que ser el mismo.
    const before = message(type, DATA[type]);
    const after = message(type, { ...DATA[type], cadence: 'monthly' });

    expect(after).toEqual(before);
  });

  it('en cadencia mensual se conservan los textos exactos', () => {
    expect(message('payout_turn', { ...DATA.payout_turn, cadence: 'monthly' }).body).toBe(
      'Este mes recibes S/ 3,000.00 de tu junta.',
    );
    expect(message('payment_received', { ...DATA.payment_received, cadence: 'monthly' }).body).toBe(
      'Tu cuota de S/ 3,000.00 de noviembre de 2026 quedó pagada.',
    );
  });

  it.each([
    ['weekly', 'es'],
    ['weekly', 'en'],
    ['biweekly', 'es'],
    ['biweekly', 'en'],
  ] as const)('en cadencia %s (%s) ningún texto dice mes', (cadence, language) => {
    for (const type of Object.keys(DATA) as NotificationType[]) {
      const { title, body } = message(type, { ...DATA[type], cadence }, language);
      const text = `${title} ${body}`.toLowerCase();

      expect(text).not.toMatch(/\bmes\b|\bmeses\b|mensual/);
      expect(text).not.toMatch(/\bmonth\b|\bmonths\b|monthly/);
    }
  });

  it('nombra el turno en la unidad de su cadencia', () => {
    expect(message('payment_received', { ...DATA.payment_received, cadence: 'weekly' }).body).toBe(
      'Tu cuota de S/ 3,000.00 de la semana 2 quedó pagada.',
    );
    expect(
      message('payment_received', { ...DATA.payment_received, cadence: 'biweekly' }).body,
    ).toBe('Tu cuota de S/ 3,000.00 de la quincena 2 quedó pagada.');
    expect(
      message('payment_received', { ...DATA.payment_received, cadence: 'weekly' }, 'en').body,
    ).toBe('Your PEN 3,000.00 installment for week 2 is paid.');
  });

  it('el turno de cobro de una junta no mensual se avisa con su fecha', () => {
    // Decirle «este mes cobras» a los cuatro miembros que cobran en noviembre no identifica a
    // nadie; la fecha sí.
    const weekly = message('payout_turn', { ...DATA.payout_turn, cadence: 'weekly' });

    expect(weekly.title).toBe('Te toca cobrar');
    expect(weekly.body).toContain('11 nov. 2026');
  });

  it('los avisos sin cadencia en los datos se escriben como mensuales', () => {
    // Es lo que tienen guardado los avisos anteriores a la épica.
    expect(message('payout_turn', { amount: AMOUNT, period: '2026-11' }).body).toBe(
      'Este mes recibes S/ 3,000.00 de tu junta.',
    );
  });
});

describe('Antelación del recordatorio por cadencia (COPAYNI-120)', () => {
  it('convierte la configuración en días por cadencia', () => {
    expect(dueSoonByCadenceFrom(['weekly:1', 'biweekly:2'])).toEqual({ weekly: 1, biweekly: 2 });
    expect(dueSoonByCadenceFrom([])).toEqual({});
    expect(dueSoonByCadenceFrom(undefined)).toEqual({});
  });

  it('cero es un valor válido: no se manda recordatorio previo', () => {
    // Es la palanca para no saturar un ciclo corto: queda solo el aviso del día del vencimiento.
    expect(dueSoonByCadenceFrom(['weekly:0'])).toEqual({ weekly: 0 });
  });

  it('descarta entradas que no nombran una cadencia o un número de días válido', () => {
    expect(dueSoonByCadenceFrom(['diaria:1', 'weekly:x', 'weekly:-1', 'suelta'])).toEqual({});
  });

  it('la API no arranca si la antelación no cabe en el ciclo de una cadencia habilitada', () => {
    const env = {
      ...TEST_ENV,
      CIRCLE_CADENCES_ENABLED: 'monthly,weekly',
      DELINQUENCY_GRACE_DAYS_BY_CADENCE: 'weekly:1',
      LATE_FEE_BPS_BY_CADENCE: 'weekly:150',
    };
    // Los 3 días por defecto sobre un ciclo de 7 se admiten; 7 o más, no. Con `weekly:1` lo único
    // que impide arrancar es la plantilla del contrato (COPAYNI-119), ya no la antelación.
    expect(() =>
      validateEnvironment({ ...env, NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: 'weekly:1' }),
    ).toThrow(/weekly no tiene plantilla de contrato aprobada/);
    expect(() =>
      validateEnvironment({ ...env, NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: 'weekly:7' }),
    ).toThrow(/NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE/);
    // Y sin entrada propia rige el valor general, que también tiene que caber.
    expect(() => validateEnvironment({ ...env, NOTIFICATION_DUE_SOON_DAYS: '10' })).toThrow(
      /NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE/,
    );
  });

  it('con solo la cadencia mensual, la configuración de hoy sigue arrancando', () => {
    expect(() => validateEnvironment({ ...TEST_ENV })).not.toThrow();
    expect(validateEnvironment({ ...TEST_ENV }).NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE).toEqual([]);
  });
});

describe('Cuántos avisos recibe una persona por turno (COPAYNI-120)', () => {
  /**
   * El límite acordado: **3 avisos por turno y por persona** en su propia cuota, más los de su
   * turno de cobro, que ocurren una sola vez en toda la junta.
   *
   * La cuenta no depende de la cadencia; lo que cambia es cuántos turnos hay al año, y eso es
   * inherente al producto. La palanca para el ciclo corto es la antelación: con `weekly:0` el
   * recordatorio previo desaparece y quedan 2.
   */
  const MAX_PER_TURN = 3;

  const noticesPerTurn = (lead: number): NotificationType[] => [
    ...(lead > 0 ? (['installment_due_soon'] as const) : []),
    'installment_due_today',
    'payment_received',
  ];

  it.each([
    ['monthly', 3],
    ['biweekly', 2],
    ['weekly', 1],
  ] as const)('en cadencia %s no pasa de %i avisos por turno', (cadence: CadenceId, lead) => {
    const notices = noticesPerTurn(lead);

    expect(notices).toHaveLength(MAX_PER_TURN);
    // Y todos se escriben sin hablar de meses fuera de la mensual.
    for (const type of notices) {
      const { title, body } = message(type, { ...DATA[type], cadence });
      if (cadence !== 'monthly') {
        expect(`${title} ${body}`.toLowerCase()).not.toMatch(/\bmes\b|mensual/);
      }
    }
  });

  it('sin recordatorio previo quedan dos avisos por turno', () => {
    expect(noticesPerTurn(0)).toEqual(['installment_due_today', 'payment_received']);
  });
});
