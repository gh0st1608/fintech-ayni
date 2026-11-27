import { validateEnvironment } from '@src/config/env.validation';
import {
  type AgreementData,
  renderAgreement,
  templateVersion,
} from '@src/modules/agreements/domain/templates';
import {
  approvalFor,
  cadenceCanBeOffered,
} from '@src/modules/agreements/domain/template-approvals';
import { type CadenceId } from '@src/modules/circles/domain/value-objects/cadence';
import { Money } from '@src/shared/domain/value-objects/money';
import { TEST_ENV } from '@test/setup-env';

/**
 * El contrato y el pagaré por cadencia (COPAYNI-119).
 *
 * El documento describe la obligación que el miembro asume, y las plantillas anteriores hablaban
 * de «meses» y de «mes de cobro». En una junta semanal eso es falso: diez turnos semanales no son
 * diez meses ni diez cuotas mensuales, y el pagaré es el título que respalda el cobro, así que su
 * texto tiene que coincidir con el calendario que el sistema aplica.
 *
 * La equivalencia a meses no sirve como plazo: hay 4,33 semanas por mes, así que ninguna cantidad
 * de semanas cuadra con un número entero de meses. El documento expresa turnos, frecuencia y la
 * fecha real de cada vencimiento, y la referencia en meses va marcada como aproximada.
 */
const pen = (major: number) => Money.of(major * 100, 'PEN');

/** Una junta semanal de 4 turnos desde el miércoles 4 de noviembre: los cuatro en noviembre. */
const WEEKLY: AgreementData = {
  payout: pen(12_000),
  months: 4,
  turns: 4,
  position: 1,
  baseInstallment: pen(3_000),
  totalPaid: pen(12_000),
  retention: pen(6_000),
  netPayout: pen(6_000),
  startsOn: '2026-11',
  startsOnDate: '2026-11-04',
  endsOnDate: '2026-11-25',
  payoutPeriod: '2026-11',
  payoutOn: '2026-11-04',
  cadence: 'weekly',
  unit: 'semana',
  dueDates: [
    { turn: 1, dueOn: '2026-11-04' },
    { turn: 2, dueOn: '2026-11-11' },
    { turn: 3, dueOn: '2026-11-18' },
    { turn: 4, dueOn: '2026-11-25' },
  ],
  graceDays: 1,
  lateFeeBps: 70,
};

/** La misma junta en mensual, como las que existen hoy. */
const MONTHLY: AgreementData = {
  ...WEEKLY,
  cadence: 'monthly',
  unit: 'mes',
  startsOnDate: '2026-11-01',
  endsOnDate: '2027-02-01',
  payoutOn: '2026-11-01',
  dueDates: [
    { turn: 1, dueOn: '2026-11-01' },
    { turn: 2, dueOn: '2026-12-01' },
    { turn: 3, dueOn: '2027-01-01' },
    { turn: 4, dueOn: '2027-02-01' },
  ],
  graceDays: 3,
  lateFeeBps: 300,
};

const BIWEEKLY: AgreementData = { ...WEEKLY, cadence: 'biweekly', unit: 'quincena' };

const documents = (data: AgreementData) => [
  renderAgreement('contract', data),
  renderAgreement('promissory_note', data),
];

describe('Documentos por cadencia (COPAYNI-119)', () => {
  it('el plazo son turnos y fechas reales, no meses', () => {
    const [contract] = documents(WEEKLY);

    expect(contract).toContain('círculo de ahorro de 4 semanas');
    expect(contract).toContain('frecuencia semanal');
    expect(contract).toContain('inicia el 2026-11-04');
    expect(contract).toContain('termina el');
    expect(contract).toContain('2026-11-25');
  });

  it('lleva el calendario completo, una línea por vencimiento', () => {
    for (const text of documents(WEEKLY)) {
      expect(text).toContain('Calendario de vencimientos (4 semanas, frecuencia semanal):');
      expect(text).toContain('Turno 1: vence el 2026-11-04.');
      expect(text).toContain('Turno 4: vence el 2026-11-25.');
      // Las cuatro fechas, aunque las cuatro caigan en el mismo mes.
      expect(text.match(/Turno \d+: vence el /g)).toHaveLength(4);
    }
  });

  it.each(['weekly', 'biweekly'] as const)(
    'en cadencia %s ningún documento expresa el plazo en meses',
    (cadence) => {
      const data = cadence === 'weekly' ? WEEKLY : BIWEEKLY;

      for (const text of documents(data)) {
        // La única mención admitida es la referencia marcada como aproximada.
        const lines = text.split('\n').filter((line) => /\bmes\b|\bmeses\b|mensual/i.test(line));
        expect(
          lines.every((line) => /Referencia aproximada|sin valor como plazo|El plazo/.test(line)),
        ).toBe(true);
      }
    },
  );

  it('la referencia en meses va marcada como aproximada y sin valor de plazo', () => {
    const [contract] = documents(WEEKLY);

    // 4 turnos semanales son 28 días, que no son «un mes»: 0,9 meses.
    expect(contract).toContain('Referencia aproximada, sin valor como plazo: unos 0.9 meses');
    expect(contract).toContain('(28 días corridos). El plazo de la obligación son las fechas');
  });

  it('en cadencia mensual no imprime la referencia: el plazo ya está en meses', () => {
    const [contract] = documents(MONTHLY);

    expect(contract).toContain('círculo de ahorro de 4 meses');
    expect(contract).not.toContain('Referencia aproximada');
  });

  it('dice la retención y lo que recibe de inmediato, los dos importes', () => {
    // 4 turnos: quien cobra primero retiene el 50 % del pozo, y el documento lo dice.
    const [contract] = documents(WEEKLY);

    expect(contract).toContain(
      'Retención aplicada al cobro, que paga sus últimas cuotas: 6000.00 PEN',
    );
    expect(contract).toContain('Importe que recibe de inmediato: 6000.00 PEN');
    expect(contract).toContain('Monto del pozo: 12000.00 PEN');
  });

  it('el cargo por mora y la gracia son los de esa cadencia', () => {
    // COPAYNI-111: la semanal tiene su propia gracia y su propio cargo, y el documento no puede
    // decir «el vigente» cuando el valor que se aplica es otro.
    const [weeklyContract, weeklyNote] = documents(WEEKLY);
    expect(weeklyContract).toContain('Días de gracia desde el vencimiento: 1.');
    expect(weeklyContract).toContain('Cargo por mora sobre la cuota vencida: 0.70 %.');
    expect(weeklyNote).toContain('cargo por mora de 0.70 %');

    const [monthlyContract] = documents(MONTHLY);
    expect(monthlyContract).toContain('Días de gracia desde el vencimiento: 3.');
    expect(monthlyContract).toContain('Cargo por mora sobre la cuota vencida: 3.00 %.');
  });

  it('la versión del documento lleva la cadencia, y cada una se aprueba por separado', () => {
    expect(templateVersion('contract', 'weekly')).toBe('contract-provisional-2-weekly');
    expect(templateVersion('promissory_note', 'monthly')).toBe(
      'promissory-note-provisional-2-monthly',
    );
    for (const text of documents(WEEKLY)) {
      expect(text).toContain('Versión de la plantilla: ');
      expect(text).toContain('-weekly');
    }
  });

  it('el documento dice sobre qué base se emite', () => {
    // La mensual sale con el texto provisional que aceptó el PO; eso va dentro del documento.
    const [contract] = documents(MONTHLY);
    expect(contract).toContain('Aprobación de la plantilla: provisional-po — PO (Erick Galindo)');
    expect(contract).toContain('TEXTO PROVISIONAL, PENDIENTE DE REDACCIÓN POR EL ÁREA LEGAL');

    // Y una cadencia sin aprobación lo dice en el propio texto, además de no poder habilitarse.
    const [weekly] = documents(WEEKLY);
    expect(weekly).toContain(
      'Aprobación de la plantilla: NINGUNA. Este documento no debe emitirse.',
    );
  });
});

describe('Registro de aprobaciones (COPAYNI-119)', () => {
  it('solo la mensual tiene plantilla emitible, y sobre base provisional', () => {
    expect(approvalFor('monthly')).toMatchObject({
      basis: 'provisional-po',
      approvedBy: 'PO (Erick Galindo)',
      approvedOn: '2026-11-16',
    });
    expect(approvalFor('weekly')).toBeNull();
    expect(approvalFor('biweekly')).toBeNull();
  });

  it.each([
    ['monthly', true],
    ['weekly', false],
    ['biweekly', false],
  ] as const)('la cadencia %s se puede ofrecer: %s', (cadence: CadenceId, offered) => {
    expect(cadenceCanBeOffered(cadence)).toBe(offered);
  });

  it('la API no arranca con una cadencia cuya plantilla no está aprobada', () => {
    // Es el bloqueo de COPAYNI-119 sobre COPAYNI-116, aplicado por el sistema: un cambio de
    // variable de entorno no puede poner en producción un contrato que nadie aprobó.
    const env = {
      ...TEST_ENV,
      DELINQUENCY_GRACE_DAYS_BY_CADENCE: 'weekly:1',
      LATE_FEE_BPS_BY_CADENCE: 'weekly:70',
      NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: 'weekly:1',
    };

    expect(() =>
      validateEnvironment({ ...env, CIRCLE_CADENCES_ENABLED: 'monthly,weekly' }),
    ).toThrow(/weekly no tiene plantilla de contrato aprobada/);
    // Y con solo la mensual arranca, que es lo que hay hoy en producción.
    expect(() => validateEnvironment({ ...TEST_ENV })).not.toThrow();
  });
});
