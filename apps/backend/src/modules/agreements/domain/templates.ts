import { createHash } from 'node:crypto';

import { type Money } from '../../../shared/domain/value-objects/money';
import { type AgreementDocument } from './agreement';

/**
 * Versión de cada plantilla. Cambiarla al cambiar el texto: la versión y el hash quedan con la
 * evidencia, así se sabe exactamente qué firmó cada persona (COPAYNI-89).
 *
 * `provisional` marca que el texto **no lo redactó Legal**. Las preguntas abiertas están en
 * pending-scope §3.3 (PG5): sin el texto definitivo, y sin resolver PG1 a PG4, esto sirve como
 * reconocimiento de deuda y no debe presentarse como un título valor con mérito ejecutivo.
 */
export const TEMPLATE_VERSIONS = {
  contract: 'contract-provisional-1',
  promissory_note: 'promissory-note-provisional-1',
} as const satisfies Record<AgreementDocument, string>;

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
}

/** Monto legible: unidades mayores con dos decimales y la moneda ISO, p. ej. `6000.00 PEN`. */
const amount = (money: Money): string => `${(money.amount / 100).toFixed(2)} ${money.currency}`;

const AVISO_PROVISIONAL = [
  'AVISO: TEXTO PROVISIONAL, PENDIENTE DE REDACCIÓN POR EL ÁREA LEGAL.',
  'No constituye asesoría legal ni un título valor con mérito ejecutivo.',
  'Ver docs/pending-scope.md §3.3 (PG1 a PG5).',
].join('\n');

/**
 * `months` llega del número de turnos del círculo, y este texto lo lee como meses y como
 * periodicidad de la cuota. Es correcto en cadencia mensual, la única que existía al redactarlo,
 * y deja de serlo en cuanto la junta es semanal o quincenal: diez turnos semanales no son diez
 * meses ni diez cuotas mensuales (COPAYNI-105).
 *
 * No se corrige aquí a propósito. El contrato y el pagaré son texto provisional pendiente de
 * redacción legal, y la versión por cadencia es COPAYNI-119: cambiar la prosa antes de esa
 * revisión daría un documento igual de inexacto, pero con apariencia de aprobado.
 */
const contractText = (data: AgreementData): string =>
  [
    "CONTRATO DE PARTICIPACIÓN EN CÍRCULO DE AHORRO (GAME'YA)",
    '',
    AVISO_PROVISIONAL,
    '',
    '1. OBJETO',
    `El participante se incorpora a un círculo de ahorro de ${data.months} meses, que inicia en ${data.startsOn}.`,
    '',
    '2. TURNO Y COBRO',
    `Turno asignado: ${data.position} de ${data.months}.`,
    `Mes de cobro: ${data.payoutPeriod}.`,
    `Monto del pozo a recibir: ${amount(data.payout)}.`,
    `Retención aplicada al cobro, que paga sus últimas cuotas: ${amount(data.retention)}.`,
    '',
    '3. APORTES',
    `Cuota base mensual: ${amount(data.baseInstallment)}.`,
    `Total a aportar por el turno, incluidos cargos y descuentos: ${amount(data.totalPaid)}.`,
    'Las cuotas vencen el día que fija el reglamento del círculo, con los días de gracia vigentes.',
    '',
    '4. INCUMPLIMIENTO',
    'El impago de una cuota, vencida la gracia, da lugar a la exclusión del círculo, al cargo por',
    'mora vigente y al bloqueo para unirse a otro círculo hasta regularizar la deuda.',
    '',
    '5. DEVOLUCIÓN',
    'Al excluido antes de su mes de cobro se le devuelven sus cuotas aportadas, menos la penalidad',
    'vigente, al cierre del círculo. La devolución se retiene mientras exista deuda pendiente.',
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
    `Cuota base mensual: ${amount(data.baseInstallment)}.`,
    `Turno: ${data.position} de ${data.months}. Mes de cobro: ${data.payoutPeriod}.`,
    '',
    'La obligación se hace exigible por el saldo impago de las cuotas restantes, más el cargo por',
    'mora vigente, descontada la retención aplicada al cobro del pozo.',
    '',
    'PENDIENTE DE LEGAL: el monto de un pagaré debe ser determinado y aquí la deuda es contingente',
    '(PG3). La forma de fijarlo y la vía de firma (PG1 y PG2) condicionan la validez del título.',
  ].join('\n');

/** Texto canónico del documento con los datos de la unión: es lo que se firma y se hashea. */
export function renderAgreement(document: AgreementDocument, data: AgreementData): string {
  const body = document === 'contract' ? contractText(data) : promissoryNoteText(data);
  return `${body}\n\nVersión de la plantilla: ${TEMPLATE_VERSIONS[document]}\n`;
}

/** SHA-256 en hexadecimal del texto canónico: la evidencia de qué se firmó. */
export function hashOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
