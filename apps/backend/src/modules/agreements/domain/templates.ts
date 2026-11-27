import { createHash } from 'node:crypto';

import { type Money } from '../../../shared/domain/value-objects/money';
import { type CadenceId } from '../../circles/domain/value-objects/cadence';
import { type AgreementDocument } from './agreement';
import { approvalFor } from './template-approvals';

/**
 * Versión de cada plantilla. Cambiarla al cambiar el texto: la versión y el hash quedan con la
 * evidencia, así se sabe exactamente qué firmó cada persona (COPAYNI-89).
 *
 * `provisional` marca que el texto **no lo redactó Legal**. Las preguntas abiertas están en
 * pending-scope §3.3 (PG5): sin el texto definitivo, y sin resolver PG1 a PG4, esto sirve como
 * reconocimiento de deuda y no debe presentarse como un título valor con mérito ejecutivo.
 */
const TEMPLATE_VERSIONS = {
  contract: 'contract-provisional-2',
  promissory_note: 'promissory-note-provisional-2',
} as const satisfies Record<AgreementDocument, string>;

/**
 * Versión de la plantilla **de esa cadencia**: `contract-provisional-2-weekly`.
 *
 * Es una sola plantilla parametrizada, pero cada cadencia produce un documento distinto y cada
 * uno se aprueba por separado (COPAYNI-119), así que la versión los distingue. La versión y el
 * hash quedan con la evidencia de cada firma: lo ya firmado no cambia cuando el texto evoluciona.
 */
export function templateVersion(document: AgreementDocument, cadence: CadenceId): string {
  return `${TEMPLATE_VERSIONS[document]}-${cadence}`;
}

/** Un vencimiento del calendario que se imprime en el documento. */
export interface AgreementDueDate {
  readonly turn: number;
  /** `YYYY-MM-DD`. */
  readonly dueOn: string;
}

/** Datos de la unión con los que se rellena la plantilla. Los montos van en unidades menores. */
export interface AgreementData {
  readonly payout: Money;
  readonly months: number;
  readonly position: number;
  readonly baseInstallment: Money;
  /** Cuánto paga en total por el turno, con fees y descuentos (SlotQuote.totalPaid). */
  readonly totalPaid: Money;
  /** Retención del payout que paga sus últimas cuotas (COPAYNI-60). */
  readonly retention: Money;
  /** Mes en que empieza el círculo, `YYYY-MM`. */
  readonly startsOn: string;
  /** Mes en que le toca cobrar, `YYYY-MM`. */
  readonly payoutPeriod: string;
  /**
   * Frecuencia de los turnos y su unidad (COPAYNI-119). Sin ellas el documento hablaría de meses
   * sobre una obligación que vence por semanas, y diría algo distinto de lo que el sistema cobra.
   */
  readonly cadence: CadenceId;
  readonly turns: number;
  /** Cómo se nombra un turno: «mes», «quincena», «semana». */
  readonly unit: string;
  /** Día real del primer turno, `YYYY-MM-DD`. */
  readonly startsOnDate: string;
  /** Día real del último turno: cuándo termina la obligación. */
  readonly endsOnDate: string;
  /** Día real en que cobra el pozo. */
  readonly payoutOn: string;
  /** Lo que recibe de inmediato: el pozo menos la retención. */
  readonly netPayout: Money;
  /** Calendario completo de vencimientos, en orden. */
  readonly dueDates: readonly AgreementDueDate[];
  /** Días de gracia y cargo por mora **de esa cadencia** (COPAYNI-111). */
  readonly graceDays: number;
  readonly lateFeeBps: number;
}

/** Monto legible: unidades mayores con dos decimales y la moneda ISO, p. ej. `6000.00 PEN`. */
const amount = (money: Money): string => `${(money.amount / 100).toFixed(2)} ${money.currency}`;

/** Porcentaje legible desde puntos base: `300` es `3.00 %`. */
const percent = (bps: number): string => `${(bps / 100).toFixed(2)} %`;

/** Cómo se nombran varios turnos de esa cadencia: «10 semanas». */
const turnsText = (data: AgreementData): string =>
  `${data.turns} ${data.turns === 1 ? data.unit : PLURAL_UNITS[data.cadence]}`;

const PLURAL_UNITS: Record<CadenceId, string> = {
  monthly: 'meses',
  biweekly: 'quincenas',
  weekly: 'semanas',
};

/** Cada cuánto vence una cuota, dicho en la unidad de la cadencia. */
const FREQUENCY_TEXT: Record<CadenceId, string> = {
  monthly: 'mensual',
  biweekly: 'quincenal',
  weekly: 'semanal',
};

/**
 * El calendario completo de vencimientos (COPAYNI-119).
 *
 * Va entero y con fechas reales, no como una duración en meses: hay 4,33 semanas por mes, así
 * que ninguna cantidad de semanas cuadra con un número entero de meses y «dos meses» describiría
 * una obligación distinta de la que el sistema cobra. En una junta de 24 turnos son 24 líneas, y
 * es el precio de que el documento diga exactamente lo que ocurre.
 */
const scheduleText = (data: AgreementData): string[] => [
  `Calendario de vencimientos (${turnsText(data)}, frecuencia ${FREQUENCY_TEXT[data.cadence]}):`,
  ...data.dueDates.map(({ turn, dueOn }) => `  Turno ${turn}: vence el ${dueOn}.`),
];

/**
 * Referencia aproximada en meses, marcada como tal.
 *
 * El ticket lo admite solo así: como referencia, nunca como el plazo de la obligación. En
 * cadencia mensual no se imprime, porque ahí el plazo ya está en meses y repetirlo sobraría.
 */
const approximateMonths = (data: AgreementData): string[] => {
  if (data.cadence === 'monthly') return [];
  const days = data.dueDates.length * (data.cadence === 'weekly' ? 7 : 14);
  return [
    `Referencia aproximada, sin valor como plazo: unos ${(days / 30.44).toFixed(1)} meses`,
    `(${days} días corridos). El plazo de la obligación son las fechas de arriba.`,
  ];
};

const AVISO_PROVISIONAL = [
  'AVISO: TEXTO PROVISIONAL, PENDIENTE DE REDACCIÓN POR EL ÁREA LEGAL.',
  'No constituye asesoría legal ni un título valor con mérito ejecutivo.',
  'Ver docs/pending-scope.md §3.3 (PG1 a PG5).',
].join('\n');

/**
 * El contrato, con la obligación expresada en turnos y fechas reales (COPAYNI-119).
 *
 * Una sola plantilla parametrizada: la cadencia, los turnos, el calendario, la retención y los
 * parámetros de morosidad son variables. No dice «meses» salvo en cadencia mensual, porque diez
 * turnos semanales no son diez meses ni diez cuotas mensuales.
 *
 * El texto sigue siendo **provisional**: el aviso va dentro del documento y una cadencia sin
 * plantilla aprobada por Legal no se puede habilitar (`template-approvals.ts`).
 */
const contractText = (data: AgreementData): string =>
  [
    "CONTRATO DE PARTICIPACIÓN EN CÍRCULO DE AHORRO (GAME'YA)",
    '',
    AVISO_PROVISIONAL,
    '',
    '1. OBJETO',
    `El participante se incorpora a un círculo de ahorro de ${turnsText(data)}, con aportes de`,
    `frecuencia ${FREQUENCY_TEXT[data.cadence]}, que inicia el ${data.startsOnDate} y termina el`,
    `${data.endsOnDate}.`,
    ...approximateMonths(data),
    '',
    '2. TURNO Y COBRO',
    `Turno asignado: ${data.position} de ${data.turns}.`,
    `Fecha de cobro del pozo: ${data.payoutOn}.`,
    `Monto del pozo: ${amount(data.payout)}.`,
    `Retención aplicada al cobro, que paga sus últimas cuotas: ${amount(data.retention)}.`,
    `Importe que recibe de inmediato: ${amount(data.netPayout)}.`,
    '',
    '3. APORTES',
    `Cuota base por turno: ${amount(data.baseInstallment)}.`,
    `Total a aportar por el turno, incluidos cargos y descuentos: ${amount(data.totalPaid)}.`,
    ...scheduleText(data),
    '',
    '4. INCUMPLIMIENTO',
    `Días de gracia desde el vencimiento: ${data.graceDays}.`,
    `Cargo por mora sobre la cuota vencida: ${percent(data.lateFeeBps)}.`,
    'El impago de una cuota, vencida la gracia, da lugar a la exclusión del círculo, al cargo por',
    'mora indicado y al bloqueo para unirse a otro círculo hasta regularizar la deuda.',
    '',
    '5. DEVOLUCIÓN',
    'Al excluido antes de su fecha de cobro se le devuelven sus cuotas aportadas, menos la',
    'penalidad vigente, al cierre del círculo. La devolución se retiene mientras exista deuda',
    'pendiente.',
  ].join('\n');

const promissoryNoteText = (data: AgreementData): string =>
  [
    'PAGARÉ',
    '',
    AVISO_PROVISIONAL,
    '',
    'Por el presente documento el participante reconoce la obligación de pagar a la cooperativa',
    'las cuotas pendientes del círculo de ahorro en el que participa, en caso de incumplimiento',
    'posterior al cobro del pozo.',
    '',
    `Importe máximo garantizado: ${amount(data.payout)}.`,
    `Cuota base por turno: ${amount(data.baseInstallment)}.`,
    `Turno: ${data.position} de ${data.turns}, frecuencia ${FREQUENCY_TEXT[data.cadence]}.`,
    `Fecha de cobro del pozo: ${data.payoutOn}.`,
    '',
    ...scheduleText(data),
    '',
    'La obligación se hace exigible por el saldo impago de las cuotas restantes a las fechas',
    `indicadas, más el cargo por mora de ${percent(data.lateFeeBps)} sobre cada cuota vencida,`,
    'descontada la retención aplicada al cobro del pozo.',
    '',
    'PENDIENTE DE LEGAL: el monto de un pagaré debe ser determinado y aquí la deuda es contingente',
    '(PG3). La forma de fijarlo y la vía de firma (PG1 y PG2) condicionan la validez del título.',
  ].join('\n');

/** Texto canónico del documento con los datos de la unión: es lo que se firma y se hashea. */
export function renderAgreement(document: AgreementDocument, data: AgreementData): string {
  const body = document === 'contract' ? contractText(data) : promissoryNoteText(data);
  const approval = approvalFor(data.cadence);
  // Sobre qué base se emite queda **dentro** del documento: quien lo lea sabe si lo aprobó Legal
  // o si es el texto provisional que el PO aceptó emitir (COPAYNI-119).
  const basis = approval
    ? `Aprobación de la plantilla: ${approval.basis} — ${approval.approvedBy}, ${approval.approvedOn}.`
    : 'Aprobación de la plantilla: NINGUNA. Este documento no debe emitirse.';
  return [
    body,
    '',
    `Versión de la plantilla: ${templateVersion(document, data.cadence)}`,
    basis,
    '',
  ].join('\n');
}

/** SHA-256 en hexadecimal del texto canónico: la evidencia de qué se firmó. */
export function hashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
